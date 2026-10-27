import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  executePaperOrder,
  getPaperPerformance,
  getPaperPortfolio,
  PaperTradingError,
  resetPaperPortfolio,
  validatePaperOrder
} from '../services/paperTradingService.js';
import { postReset } from '../controllers/paperTradingController.js';
import paperTradingRoutes from '../routes/paperTradingRoutes.js';
import { protect } from '../middleware/authMiddleware.js';
import {
  canSubmitPaperOrder,
  DEFAULT_PAPER_ORDER,
  getPaperOrderIdempotencyKey,
  clearPaperOrderIdempotencyKey,
  getPaperOrderExecutionQuantity,
  getPaperOrderInputMessage,
  getPaperOrderModeInput,
  getPaperOrderPreview,
  isPaperQuoteFresh,
  parsePaperOrderInput
} from '../../frontend/src/utils/paperOrderPreview.js';
import { makeFullHoldingSellOrder, submitFullHoldingSell } from '../../frontend/src/utils/paperTradingActions.js';

const clone = (value) => structuredClone(value);

class MemoryPortfolio {
  static rows = new Map();
  static reset() { this.rows.clear(); }

  static findOne(filter) {
    return { lean: async () => clone(this.rows.get(String(filter.userId)) || null) };
  }

  static findOneAndUpdate(filter, update, options = {}) {
    return { lean: async () => {
      const key = String(filter.userId);
      let row = this.rows.get(key);
      if (options.upsert && !row) {
        row = { ...clone(update.$setOnInsert), createdAt: new Date(), updatedAt: new Date() };
        this.rows.set(key, row);
        return clone(row);
      }
      if (!row) return null;
      if (filter.version !== undefined && row.version !== filter.version) return null;
      if (filter.processedOrderIds?.$ne && row.processedOrderIds.includes(filter.processedOrderIds.$ne)) return null;
      if (update.$set) row = { ...row, ...clone(update.$set), updatedAt: new Date() };
      if (update.$addToSet?.processedOrderIds && !row.processedOrderIds.includes(update.$addToSet.processedOrderIds)) row.processedOrderIds.push(update.$addToSet.processedOrderIds);
      if (update.$addToSet?.processedOrderFingerprints) {
        row.processedOrderFingerprints ||= [];
        if (!row.processedOrderFingerprints.some((item) => item.orderId === update.$addToSet.processedOrderFingerprints.orderId)) {
          row.processedOrderFingerprints.push(clone(update.$addToSet.processedOrderFingerprints));
        }
      }
      if (update.$inc?.version) row.version += update.$inc.version;
      this.rows.set(key, row);
      return clone(row);
    } };
  }
}

const order = (overrides = {}) => ({ symbol: 'BTCUSDT', side: 'buy', quantity: 1, orderId: 'b9d0fd9c-cc76-42a2-a46b-5d479e52d8a2', ...overrides });
const makePriceReader = (priceBySymbol = { BTCUSDT: 100, ETHUSDT: 200 }) => async (symbols) => Object.fromEntries(symbols.map((symbol) => [symbol, priceBySymbol[symbol]]).filter(([, price]) => Number.isFinite(price)));

test.beforeEach(() => MemoryPortfolio.reset());

test('validates symbol, side, quantity precision, and idempotency key', () => {
  assert.doesNotThrow(() => validatePaperOrder(order()));
  assert.throws(() => validatePaperOrder(order({ symbol: 'BTCUSD' })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ side: 'limit' })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: 0 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: -1 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: 1_000_000.00000001 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: Number.NaN })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: 0.123456789 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: undefined, amountUsdt: 0.001 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: undefined, amountUsdt: -100 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: undefined, amountUsdt: 1_000_000_000.01 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: undefined, amountUsdt: undefined })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: undefined, amountUsdt: '100' })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ quantity: 1, amountUsdt: 100 })), PaperTradingError);
  assert.throws(() => validatePaperOrder(order({ orderId: 'replay' })), PaperTradingError);
});

test('initializes once per user and preserves portfolio data across later reads', async () => {
  const first = await getPaperPortfolio('user-a', { model: MemoryPortfolio, getPrices: makePriceReader() });
  assert.equal(first.initialBalance, 100_000);
  assert.equal(first.cash, 100_000);
  assert.equal(first.equity, 100_000);
  assert.deepEqual(first.holdings, []);
  assert.equal(MemoryPortfolio.rows.get('user-a').userId, 'user-a');

  await executePaperOrder('user-a', order({ quantity: 10 }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) });
  const afterRefresh = await getPaperPortfolio('user-a', { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 110 }) });
  assert.equal(afterRefresh.cash, 99_000);
  assert.equal(afterRefresh.equity, 100_100);
  assert.equal(afterRefresh.trades.length, 1);
  assert.equal(MemoryPortfolio.rows.size, 1);
});

test('executes market buys and sells using the server price and tracks realized P/L', async () => {
  const getPrices = makePriceReader({ BTCUSDT: 100 });
  const bought = await executePaperOrder('user-a', order({ quantity: 10 }), { model: MemoryPortfolio, getPrices });
  assert.equal(bought.trade.executionPrice, 100);
  assert.equal(bought.portfolio.cash, 99_000);
  assert.equal(bought.portfolio.holdings[0].quantity, 10);
  assert.equal(bought.portfolio.holdings[0].averageEntryPrice, 100);

  const sold = await executePaperOrder('user-a', order({ side: 'sell', quantity: 4, orderId: '8af6dfaa-307c-4f6e-beb3-a66e62e8e70e' }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 120 })
  });
  assert.equal(sold.portfolio.cash, 99_480);
  assert.equal(sold.portfolio.holdings[0].quantity, 6);
  assert.equal(sold.portfolio.realizedPnl, 80);
  assert.equal(sold.portfolio.equity, 100_200);
  assert.equal(sold.portfolio.unrealizedPnl, 120);
  assert.equal(sold.portfolio.totalPnl, 200);
  assert.equal(sold.portfolio.totalReturnPercent, 0.2);
});

test('buys by USDT amount using the server quote and tracks weighted average entry', async () => {
  const first = await executePaperOrder('user-a', order({ quantity: undefined, amountUsdt: 200 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 100 })
  });
  assert.equal(first.trade.quantity, 2);
  assert.equal(first.trade.notional, 200);

  const second = await executePaperOrder('user-a', order({ quantity: undefined, amountUsdt: 400, orderId: '49eb23f8-26ed-4269-8cc9-920c3b314d55' }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 200 })
  });
  assert.equal(second.trade.quantity, 2);
  assert.equal(second.portfolio.holdings[0].quantity, 4);
  assert.equal(second.portfolio.holdings[0].averageEntryPrice, 150);

  const sold = await executePaperOrder('user-a', order({ side: 'sell', quantity: undefined, amountUsdt: 180, orderId: '8af6dfaa-307c-4f6e-beb3-a66e62e8e70e' }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 180 })
  });
  assert.equal(sold.trade.quantity, 1);
  assert.equal(sold.trade.realizedPnl, 30);
  assert.equal(sold.portfolio.holdings[0].quantity, 3);

  const marked = await getPaperPortfolio('user-a', { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 210 }) });
  assert.equal(marked.unrealizedPnl, 180);
  assert.equal(marked.realizedPnl, 30);
  assert.equal(marked.equity, 100_210);
  assert.equal(marked.totalPnl, marked.realizedPnl + marked.unrealizedPnl);
  assert.equal(marked.totalReturnPercent, 0.21);
});

test('rejects overselling and does not trust a client-supplied execution price', async () => {
  await executePaperOrder('user-a', order({ quantity: 1 }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) });
  await assert.rejects(() => executePaperOrder('user-a', order({ side: 'sell', quantity: 2, price: 1, orderId: 'c087e827-f7ee-4b86-a2f6-971945743646' }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 120 })
  }), /not enough of this asset/i);
  assert.equal(MemoryPortfolio.rows.get('user-a').trades[0].executionPrice, 100);
});

test('rejects insufficient cash and unavailable Binance pairs without recording trades', async () => {
  await assert.rejects(() => executePaperOrder('user-a', order({ quantity: 1001 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 100 })
  }), /not enough paper cash/i);
  assert.equal(MemoryPortfolio.rows.get('user-a').cash, 100_000);
  assert.equal(MemoryPortfolio.rows.get('user-a').trades.length, 0);

  await assert.rejects(() => executePaperOrder('user-a', order({ symbol: 'FAKEUSDT' }), {
    model: MemoryPortfolio,
    getPrices: async () => { const error = new Error('Binance invalid symbol'); error.status = 400; throw error; }
  }), /not available on Binance spot/i);
  assert.equal(MemoryPortfolio.rows.get('user-a').trades.length, 0);
});

test('rejects missing, zero, negative, and non-finite server prices without mutating the portfolio', async () => {
  for (const [index, price] of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY].entries()) {
    await assert.rejects(() => executePaperOrder(`bad-price-${index}`, order(), {
      model: MemoryPortfolio,
      getPrices: async () => ({ BTCUSDT: price })
    }), /not available on Binance spot/i);
    const row = MemoryPortfolio.rows.get(`bad-price-${index}`);
    assert.equal(row.cash, 100_000);
    assert.equal(row.trades.length, 0);
  }
});

test('prevents duplicate order replay and concurrent double spending', async () => {
  const firstKey = 'b9d0fd9c-cc76-42a2-a46b-5d479e52d8a2';
  const first = await executePaperOrder('user-a', order({ orderId: firstKey }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) });
  const duplicate = await executePaperOrder('user-a', order({ orderId: firstKey }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) });
  assert.equal(first.portfolio.trades.length, 1);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.portfolio.trades.length, 1);
  assert.deepEqual(duplicate.trade, first.trade);
  await assert.rejects(() => executePaperOrder('user-a', order({ quantity: 2, orderId: firstKey }), {
    model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 })
  }), (error) => error.status === 409 && /different order/i.test(error.message));

  const results = await Promise.allSettled([
    executePaperOrder('user-b', order({ quantity: 800, orderId: '49eb23f8-26ed-4269-8cc9-920c3b314d55' }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) }),
    executePaperOrder('user-b', order({ quantity: 800, orderId: '62be5849-8d15-46d8-a998-140d74b0652a' }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) })
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(MemoryPortfolio.rows.get('user-b').cash, 20_000);
});

test('resets only the signed-in user portfolio and keeps replay keys; performance uses stored execution values', async () => {
  const orderId = 'b9d0fd9c-cc76-42a2-a46b-5d479e52d8a2';
  await executePaperOrder('user-a', order({ orderId }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 }) });
  await executePaperOrder('user-b', order({ orderId: '49eb23f8-26ed-4269-8cc9-920c3b314d55', symbol: 'ETHUSDT' }), { model: MemoryPortfolio, getPrices: makePriceReader() });
  const reset = await resetPaperPortfolio('user-a', { model: MemoryPortfolio });
  assert.equal(reset.cash, 100_000);
  assert.equal(reset.trades.length, 0);
  assert.equal(MemoryPortfolio.rows.get('user-a').processedOrderIds.includes(orderId), true);
  assert.equal(MemoryPortfolio.rows.get('user-b').holdings[0].symbol, 'ETHUSDT');

  const history = await getPaperPerformance('user-b', { model: MemoryPortfolio, getPrices: makePriceReader() });
  assert.equal(history.points[1].value, 100_000);
});

test('requires explicit reset confirmation before clearing a portfolio', async () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await postReset({ body: {} }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, 'Confirm the reset before clearing this paper portfolio.');
  assert.equal(MemoryPortfolio.rows.size, 0);
});

test('paper-trading routes install authentication first and reject requests without a token', async () => {
  assert.equal(paperTradingRoutes.stack[0].name, 'protect');
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalled = false;
  await protect({ header: () => undefined }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.success, false);
  assert.equal(nextCalled, false);
});

test('order preview derives amount and quantity from the selected pair quote and current input mode', () => {
  assert.deepEqual(DEFAULT_PAPER_ORDER, { mode: 'quote', input: '100.00' });
  const btcQuote = { symbol: 'BTCUSDT', price: 40_000, updatedAt: new Date() };
  const amountPreview = getPaperOrderPreview({ mode: 'quote', input: '100.00', quote: btcQuote, symbol: 'BTCUSDT' });
  assert.equal(amountPreview.value, 100);
  assert.equal(amountPreview.quantity, 0.0025);

  const quantityPreview = getPaperOrderPreview({ mode: 'quantity', input: '0.25', quote: btcQuote, symbol: 'BTCUSDT' });
  assert.equal(quantityPreview.quantity, 0.25);
  assert.equal(quantityPreview.value, 10_000);

  const budgetPreview = getPaperOrderPreview({
    mode: 'quote', input: '100.00', quote: { symbol: 'BTCUSDT', price: 80_242.51, updatedAt: new Date() }, symbol: 'BTCUSDT'
  });
  assert.ok(budgetPreview.value <= 100);
  assert.ok(budgetPreview.quantity <= 100 / 80_242.51);

  assert.equal(getPaperOrderPreview({ mode: 'quote', input: '100', quote: btcQuote, symbol: 'ETHUSDT' }), null);
  assert.equal(getPaperOrderPreview({ mode: 'quote', input: '', quote: btcQuote, symbol: 'BTCUSDT' }), null);
  assert.equal(parsePaperOrderInput('quote', '0.001'), null);
  assert.equal(parsePaperOrderInput('quantity', '0.123456789'), null);
});

test('switching order mode preserves an equivalent safe estimate and recalculates its units', () => {
  const quote = { symbol: 'BTCUSDT', price: 30_000, updatedAt: new Date() };
  const quantityInput = getPaperOrderModeInput({ mode: 'quote', nextMode: 'quantity', input: '100.00', quote, symbol: 'BTCUSDT' });
  assert.equal(quantityInput, '0.00333333');
  const quantityPreview = getPaperOrderPreview({ mode: 'quantity', input: quantityInput, quote, symbol: 'BTCUSDT' });
  assert.equal(quantityPreview.quantity, 0.00333333);
  assert.ok(quantityPreview.value <= 100);

  const quoteInput = getPaperOrderModeInput({ mode: 'quantity', nextMode: 'quote', input: '0.00333333', quote, symbol: 'BTCUSDT' });
  assert.equal(quoteInput, '99.99');
  assert.equal(getPaperOrderModeInput({ mode: 'quote', nextMode: 'quantity', input: '', quote, symbol: 'BTCUSDT' }), '');
});

test('Buy and Sell availability requires a valid quote, valid input, and sufficient account funds or holdings', () => {
  const quote = { symbol: 'BTCUSDT', price: 100, updatedAt: new Date() };
  const common = { mode: 'quote', input: '100.00', quote, symbol: 'BTCUSDT' };
  assert.equal(canSubmitPaperOrder({ ...common, side: 'buy', availableCash: 100 }), true);
  assert.equal(canSubmitPaperOrder({ ...common, side: 'buy', availableCash: 99.99 }), false);
  assert.equal(canSubmitPaperOrder({ ...common, side: 'sell', holdingQuantity: 1 }), true);
  assert.equal(canSubmitPaperOrder({ ...common, side: 'sell', holdingQuantity: 0.99999999 }), false);
  assert.equal(canSubmitPaperOrder({ ...common, side: 'sell', holdingQuantity: 1, busy: true }), false);
  assert.equal(canSubmitPaperOrder({ ...common, side: 'buy', availableCash: 100, quote: null }), false);
  assert.equal(getPaperOrderExecutionQuantity(common), 1);
});

test('amount-mode BUY rounds quantity down so recorded notional and cash debit never exceed the request', async () => {
  const requested = 100;
  const price = 80_242.51;
  const result = await executePaperOrder('user-buy-budget', order({ quantity: undefined, amountUsdt: requested }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: price })
  });
  assert.equal(result.trade.quantity, Math.floor((requested / price) * 1e8) / 1e8);
  assert.ok(result.trade.notional <= requested);
  assert.equal(Number((100_000 - result.portfolio.cash).toFixed(8)), result.trade.notional);
  assert.equal(result.trade.cashAfter, result.portfolio.cash);
});

test('amount-mode SELL rounds quantity down so recorded notional and cash credit never exceed the request', async () => {
  const amount = 100;
  const sellPrice = 80_234.13;
  await executePaperOrder('user-sell-budget', order({ quantity: 0.005 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 80_242.51 })
  });
  const before = MemoryPortfolio.rows.get('user-sell-budget').cash;
  const sold = await executePaperOrder('user-sell-budget', order({
    side: 'sell', quantity: undefined, amountUsdt: amount, orderId: 'ec7b065d-a20e-4ee0-845a-65fe06b57ec4'
  }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: sellPrice }) });
  assert.equal(sold.trade.quantity, Math.floor((amount / sellPrice) * 1e8) / 1e8);
  assert.ok(sold.trade.notional <= amount);
  assert.equal(Number((sold.portfolio.cash - before).toFixed(8)), sold.trade.notional);
  assert.equal(sold.trade.cashAfter, sold.portfolio.cash);
});

test('quantity-mode BUY and SELL preserve requested quantity and calculate decimal-safe trade value and realized P/L', async () => {
  const bought = await executePaperOrder('user-quantity', order({ quantity: 0.00124647 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 80_242.51 })
  });
  assert.equal(bought.trade.quantity, 0.00124647);
  assert.equal(Number((100_000 - bought.portfolio.cash).toFixed(8)), bought.trade.notional);

  const cashBeforeSell = bought.portfolio.cash;
  const sold = await executePaperOrder('user-quantity', order({
    side: 'sell', quantity: 0.0005, orderId: '062fe2ac-f37b-43d3-a2c3-7a9f9f5e22ac'
  }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 80_234.13 }) });
  assert.equal(sold.trade.quantity, 0.0005);
  assert.equal(Number((sold.portfolio.cash - cashBeforeSell).toFixed(8)), sold.trade.notional);
  assert.equal(sold.trade.realizedPnl, -0.00419);
  assert.equal(sold.portfolio.realizedPnl, sold.trade.realizedPnl);
  assert.equal(sold.portfolio.holdings[0].quantity, 0.00074647);
  assert.ok(Math.abs(sold.portfolio.totalPnl - (sold.portfolio.realizedPnl + sold.portfolio.unrealizedPnl)) <= 0.00000001);
});

test('amount-mode orders revalidate cash and holdings after precision-safe sizing', async () => {
  await assert.rejects(() => executePaperOrder('user-amount-cash', order({ quantity: undefined, amountUsdt: 100_001 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 80_242.51 })
  }), /not enough paper cash/i);

  await executePaperOrder('user-amount-holdings', order({ quantity: 0.001 }), {
    model: MemoryPortfolio,
    getPrices: makePriceReader({ BTCUSDT: 80_242.51 })
  });
  await assert.rejects(() => executePaperOrder('user-amount-holdings', order({
    side: 'sell', quantity: undefined, amountUsdt: 100, orderId: '9cde6797-cda9-4a9a-9d2a-24b7c069aa89'
  }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 80_234.13 }) }), /not enough of this asset/i);
});

test('empty and invalid form inputs have distinct messages and do not produce an order preview', () => {
  const quote = { symbol: 'BTCUSDT', price: 80_242.51 };
  assert.equal(getPaperOrderInputMessage('quote', ''), 'Enter an amount');
  assert.equal(getPaperOrderInputMessage('quote', 'not-a-number'), 'Enter a valid amount');
  assert.equal(getPaperOrderInputMessage('quote', '100.00'), '');
  assert.equal(getPaperOrderPreview({ mode: 'quote', input: '', quote, symbol: 'BTCUSDT' }), null);
  assert.equal(getPaperOrderPreview({ mode: 'quote', input: '100.001', quote, symbol: 'BTCUSDT' }), null);
});

test('quote previews reject stale or future quotes and accept fresh quotes', () => {
  const now = Date.now();
  const fresh = { symbol: 'BTCUSDT', price: 100, updatedAt: new Date(now - 10_000) };
  const stale = { ...fresh, updatedAt: new Date(now - 46_000) };
  const future = { ...fresh, updatedAt: new Date(now + 6_000) };
  assert.equal(isPaperQuoteFresh(fresh, now), true);
  assert.equal(isPaperQuoteFresh(stale, now), false);
  assert.equal(isPaperQuoteFresh(future, now), false);
  assert.ok(getPaperOrderPreview({ mode: 'quote', input: '10.00', quote: fresh, symbol: 'BTCUSDT' }));
  assert.equal(getPaperOrderPreview({ mode: 'quote', input: '10.00', quote: stale, symbol: 'BTCUSDT' }), null);
});

test('order retry keys remain stable for the same payload and rotate when order details change', () => {
  const pending = { current: null };
  let nextId = 0;
  const createId = () => `retry-key-${++nextId}`;
  const buy = { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 100 };
  const first = getPaperOrderIdempotencyKey(buy, pending, createId);
  assert.equal(getPaperOrderIdempotencyKey(buy, pending, createId), first);
  const changed = getPaperOrderIdempotencyKey({ ...buy, amountUsdt: 200 }, pending, createId);
  assert.notEqual(changed, first);
  assert.equal(changed, 'retry-key-2');
  clearPaperOrderIdempotencyKey(buy, pending);
});

test('ambiguous order retries reuse their key after a page remount and clear it on success', () => {
  const originalStorage = globalThis.sessionStorage;
  const records = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => records.get(key) || null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key)
  };
  try {
    const orderData = { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 100 };
    let nextId = 0;
    const first = getPaperOrderIdempotencyKey(orderData, { current: null }, () => `stable-${++nextId}`);
    const retriedAfterRemount = getPaperOrderIdempotencyKey(orderData, { current: null }, () => `stable-${++nextId}`);
    assert.equal(retriedAfterRemount, first);
    clearPaperOrderIdempotencyKey(orderData, { current: null });
    assert.equal(getPaperOrderIdempotencyKey(orderData, { current: null }, () => `stable-${++nextId}`), 'stable-2');
  } finally {
    if (originalStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = originalStorage;
  }
});

test('holding sell shortcut builds an order for each asset using its full positive available quantity', () => {
  assert.deepEqual(makeFullHoldingSellOrder({ symbol: 'BTCUSDT', quantity: 0.00123456 }), {
    symbol: 'BTCUSDT', side: 'sell', quantity: 0.00123456
  });
  assert.deepEqual(makeFullHoldingSellOrder({ symbol: 'ethusdt', quantity: 2.5 }), {
    symbol: 'ETHUSDT', side: 'sell', quantity: 2.5
  });
  assert.equal(makeFullHoldingSellOrder({ symbol: 'BTCUSDT', quantity: 0 }), null);
  assert.equal(makeFullHoldingSellOrder({ symbol: 'BTCUSDT', quantity: -1 }), null);
  assert.equal(makeFullHoldingSellOrder({ symbol: 'BTCUSD', quantity: 1 }), null);
});

test('holding sell submits through the existing order API and refreshes balances and history after success', async () => {
  const calls = [];
  const applied = [];
  let successMessage = '';
  const lockRef = { current: false };
  const pendingOrderRef = { current: null };
  const result = await submitFullHoldingSell({
    holding: { symbol: 'ETHUSDT', quantity: 0.025 },
    lockRef,
    pendingOrderRef,
    submitOrder: async (order, key) => {
      calls.push({ order, key });
      return { data: { cash: 100_070, holdings: [], trades: [{ symbol: 'ETHUSDT', side: 'sell' }] }, trade: { symbol: 'ETHUSDT', side: 'sell', quantity: 0.025, executionPrice: 2_800 } };
    },
    refreshPortfolio: async () => ({ data: { cash: 100_070, holdings: [], trades: [{ symbol: 'ETHUSDT', side: 'sell' }, { symbol: 'BTCUSDT', side: 'buy' }] } }),
    onPortfolio: (portfolio) => applied.push(portfolio),
    onSuccess: (response) => { successMessage = `${response.trade.symbol} ${response.trade.quantity} @ ${response.trade.executionPrice}`; }
  });

  assert.equal(result.status, 'success');
  assert.deepEqual(calls[0].order, { symbol: 'ETHUSDT', side: 'sell', quantity: 0.025 });
  assert.equal(typeof calls[0].key, 'string');
  assert.equal(applied.length, 2, 'apply order response immediately and then the refreshed portfolio');
  assert.equal(applied[1].trades.length, 2);
  assert.equal(successMessage, 'ETHUSDT 0.025 @ 2800');
  assert.equal(lockRef.current, false);
  assert.equal(pendingOrderRef.current.size, 0, 'successful orders clear their idempotency key');
});

test('holding sell errors preserve portfolio state and retry with the same idempotency key', async () => {
  const calls = [];
  const applied = [];
  const errors = [];
  const lockRef = { current: false };
  const pendingOrderRef = { current: null };
  let attempts = 0;
  const options = {
    holding: { symbol: 'BTCUSDT', quantity: 0.5 },
    lockRef,
    pendingOrderRef,
    submitOrder: async (order, key) => {
      calls.push({ order, key });
      attempts += 1;
      if (attempts === 1) throw new Error('Live price unavailable; try again.');
      return { data: { cash: 100_050, holdings: [], trades: [] }, trade: { symbol: 'BTCUSDT', quantity: 0.5, executionPrice: 100 } };
    },
    refreshPortfolio: async () => ({ data: { cash: 100_050, holdings: [], trades: [] } }),
    onPortfolio: (portfolio) => applied.push(portfolio),
    onFailure: (error) => errors.push(error.message)
  };

  assert.equal((await submitFullHoldingSell(options)).status, 'failed');
  assert.equal(lockRef.current, false);
  assert.equal(applied.length, 0, 'a rejected or stale-price request must not mutate displayed portfolio data');
  assert.equal((await submitFullHoldingSell(options)).status, 'success');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].key, calls[1].key, 'retry keeps the key for the same pending order');
  assert.match(errors[0], /price unavailable/i);
});

test('rapid holding-sell clicks share the order lock and a refresh failure does not resubmit a sale', async () => {
  const lockRef = { current: false };
  const pendingOrderRef = { current: null };
  const submitted = [];
  const applied = [];
  const refreshErrors = [];
  let finishRequest;
  const submitOrder = async (...args) => {
    submitted.push(args);
    await new Promise((resolve) => { finishRequest = resolve; });
    return { data: { cash: 100_010, holdings: [], trades: [{ side: 'sell' }] }, trade: { symbol: 'BTCUSDT', quantity: 0.1, executionPrice: 100 } };
  };
  const options = {
    holding: { symbol: 'BTCUSDT', quantity: 0.1 }, lockRef, pendingOrderRef, submitOrder,
    refreshPortfolio: async () => { throw new Error('portfolio endpoint unavailable'); },
    onPortfolio: (portfolio) => applied.push(portfolio),
    onRefreshFailure: (error) => refreshErrors.push(error.message)
  };

  const first = submitFullHoldingSell(options);
  const duplicateClick = await submitFullHoldingSell(options);
  assert.equal(duplicateClick.status, 'ignored');
  assert.equal(submitted.length, 1);
  finishRequest();
  const completed = await first;
  assert.equal(completed.status, 'success-refresh-failed');
  assert.equal(submitted.length, 1, 'a failed follow-up refresh must never send the sale again');
  assert.equal(applied.length, 1, 'keep the successful order response as current portfolio data');
  assert.match(refreshErrors[0], /unavailable/i);
  assert.equal(lockRef.current, false);
});

test('Paper Trading table wires one accessible full-sell action per holding and keeps custom sell controls', async () => {
  const page = await readFile(new URL('../../frontend/src/pages/PaperTrading.jsx', import.meta.url), 'utf8');
  assert.match(page, /portfolio\.holdings\.map\(\(item\) => <tr key=\{item\.symbol\}/);
  assert.match(page, /aria-label=\{'Sell all ' \+ item\.symbol\}/);
  assert.match(page, /onClick=\{\(\) => sellHolding\(item\)\}/);
  assert.match(page, /className=\{side === 'sell' \? 'sell-active' : ''\}/);
  assert.match(page, /onClick=\{\(\) => changeAmountMode\('quantity'\)\}/);
  assert.match(page, /getPaperOrderExecutionQuantity/);
});

test('users remain isolated and selling the full position removes the holding', async () => {
  const sharedId = 'b9d0fd9c-cc76-42a2-a46b-5d479e52d8a2';
  await executePaperOrder('isolated-a', order({ quantity: 2, orderId: sharedId }), {
    model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 100 })
  });
  const other = await getPaperPortfolio('isolated-b', { model: MemoryPortfolio, getPrices: makePriceReader() });
  assert.equal(other.cash, 100_000);
  assert.deepEqual(other.holdings, []);
  assert.deepEqual(other.trades, []);

  const closed = await executePaperOrder('isolated-a', order({
    side: 'sell', quantity: 2, orderId: '8af6dfaa-307c-4f6e-beb3-a66e62e8e70e'
  }), { model: MemoryPortfolio, getPrices: makePriceReader({ BTCUSDT: 110 }) });
  assert.deepEqual(closed.portfolio.holdings, []);
  assert.equal(closed.portfolio.cash, 100_020);
  assert.equal(closed.portfolio.realizedPnl, 20);
});
