import { createHash } from 'node:crypto';
import PaperPortfolio from '../models/PaperPortfolio.js';
import { fetchBinanceJson } from './marketDataService.js';

export const PAPER_INITIAL_BALANCE = 100_000;
const MAX_CAS_ATTEMPTS = 8;
const VALID_SYMBOL = /^[A-Z0-9]{2,18}USDT$/;
const VALID_ORDER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ORDER_QUOTE_AMOUNT = 1_000_000_000;
const ACCOUNTING_SCALE = 100_000_000n;
const QUANTITY_SCALE = 100_000_000n;
const PRICE_SCALE = 100_000_000n;

const scaledInteger = (value, digits) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw new PaperTradingError('A numeric portfolio value is invalid.', 503);
  const negative = numeric < 0;
  const fixed = Math.abs(numeric).toFixed(digits);
  const units = BigInt(fixed.replace('.', ''));
  return negative ? -units : units;
};

const toAccountingUnits = (value) => scaledInteger(value, 8);
const toQuantityUnits = (value) => scaledInteger(value, 8);
const toPriceUnits = (value) => scaledInteger(value, 8);
const accountingUnitsToNumber = (value) => Number((Number(value) / Number(ACCOUNTING_SCALE)).toFixed(8));
const quantityUnitsToNumber = (value) => Number((Number(value) / Number(QUANTITY_SCALE)).toFixed(8));
const priceUnitsToNumber = (value) => Number((Number(value) / Number(PRICE_SCALE)).toFixed(8));

const divideRounded = (numerator, denominator) => {
  if (denominator <= 0n) throw new PaperTradingError('A portfolio calculation is invalid.', 503);
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const rounded = (absolute + denominator / 2n) / denominator;
  return negative ? -rounded : rounded;
};

const marketValueUnits = (quantityUnits, priceUnits) => divideRounded(quantityUnits * priceUnits, QUANTITY_SCALE);

const roundAccounting = (value) => accountingUnitsToNumber(toAccountingUnits(value));

export class PaperTradingError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'PaperTradingError'; this.status = status; }
}

export const validatePaperOrder = (order = {}) => {
  const { symbol, side, quantity, amountUsdt, orderId } = order || {};
  if (typeof symbol !== 'string' || !VALID_SYMBOL.test(symbol)) throw new PaperTradingError('Enter a valid Binance USDT trading pair.');
  if (!['buy', 'sell'].includes(side)) throw new PaperTradingError('Order side must be buy or sell.');
  const hasQuantity = quantity !== undefined && quantity !== null;
  const hasQuoteAmount = amountUsdt !== undefined && amountUsdt !== null;
  if (hasQuantity === hasQuoteAmount) throw new PaperTradingError('Enter either a cryptocurrency quantity or an amount in USDT.');
  if (hasQuantity) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) throw new PaperTradingError('Quantity must be a positive number up to 1,000,000.');
    if (Number(quantity.toFixed(8)) !== quantity) throw new PaperTradingError('Quantity supports up to 8 decimal places.');
  } else {
    if (typeof amountUsdt !== 'number' || !Number.isFinite(amountUsdt) || amountUsdt <= 0 || amountUsdt > MAX_ORDER_QUOTE_AMOUNT) throw new PaperTradingError('USDT amount must be positive and no greater than 1,000,000,000.');
    if (Number(amountUsdt.toFixed(2)) !== amountUsdt) throw new PaperTradingError('USDT amounts support up to 2 decimal places.');
  }
  if (typeof orderId !== 'string' || !VALID_ORDER_ID.test(orderId)) throw new PaperTradingError('A valid idempotency key is required for each order.');
};

const userFilter = (userId) => ({ userId });
const getOrderFingerprint = (order) => createHash('sha256').update(JSON.stringify({
  symbol: order.symbol.toUpperCase(),
  side: order.side,
  quantity: order.quantity ?? null,
  amountUsdt: order.amountUsdt ?? null
})).digest('hex');

export const ensurePaperPortfolio = async (userId, model = PaperPortfolio) => {
  try {
    return await model.findOneAndUpdate(
      userFilter(userId),
      { $setOnInsert: { userId, cash: PAPER_INITIAL_BALANCE, realizedPnl: 0, holdings: [], trades: [], processedOrderIds: [], processedOrderFingerprints: [], version: 0, resetAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
  } catch (error) {
    // A concurrent first request can win the unique userId insert.
    if (error.code !== 11000) throw error;
    return model.findOne(userFilter(userId)).lean();
  }
};

export const getBinancePrices = async (symbols) => {
  const unique = [...new Set(symbols)];
  if (!unique.length) return {};
  const rows = await fetchBinanceJson('ticker/price', { symbols: JSON.stringify(unique) });
  if (!Array.isArray(rows)) throw new PaperTradingError('Live Binance prices are temporarily unavailable.', 503);
  const result = {};
  for (const row of rows) {
    const price = Number(row?.price);
    if (typeof row?.symbol === 'string' && Number.isFinite(price) && price > 0) result[row.symbol] = price;
  }
  return result;
};

const makePortfolioSnapshot = (portfolio, prices = {}) => {
  const holdings = (portfolio.holdings || []).map((item) => {
    const lastPrice = prices[item.symbol] ?? null;
    const quantityUnits = toQuantityUnits(item.quantity);
    const marketValueUnitsValue = lastPrice === null ? null : marketValueUnits(quantityUnits, toPriceUnits(lastPrice));
    const costBasisUnits = marketValueUnits(quantityUnits, toPriceUnits(item.averageEntryPrice));
    const unrealizedPnlUnits = marketValueUnitsValue === null ? null : marketValueUnitsValue - costBasisUnits;
    return {
      ...item,
      lastPrice,
      marketValue: marketValueUnitsValue === null ? null : accountingUnitsToNumber(marketValueUnitsValue),
      unrealizedPnl: unrealizedPnlUnits === null ? null : accountingUnitsToNumber(unrealizedPnlUnits)
    };
  });
  const priced = holdings.every((item) => item.marketValue !== null);
  const equityUnits = priced
    ? toAccountingUnits(portfolio.cash) + holdings.reduce((sum, item) => sum + toAccountingUnits(item.marketValue), 0n)
    : null;
  const equity = equityUnits === null ? null : accountingUnitsToNumber(equityUnits);
  const unrealizedPnlUnits = priced ? holdings.reduce((sum, item) => sum + toAccountingUnits(item.unrealizedPnl), 0n) : null;
  const unrealizedPnl = unrealizedPnlUnits === null ? null : accountingUnitsToNumber(unrealizedPnlUnits);
  const totalPnlUnits = equityUnits === null ? null : equityUnits - toAccountingUnits(PAPER_INITIAL_BALANCE);
  const totalPnl = totalPnlUnits === null ? null : accountingUnitsToNumber(totalPnlUnits);
  return {
    initialBalance: PAPER_INITIAL_BALANCE,
    cash: portfolio.cash,
    holdings,
    realizedPnl: portfolio.realizedPnl,
    unrealizedPnl,
    equity,
    totalPnl,
    totalReturnPercent: totalPnlUnits === null ? null : roundAccounting((Number(totalPnlUnits) / Number(ACCOUNTING_SCALE) / PAPER_INITIAL_BALANCE) * 100),
    trades: portfolio.trades || [],
    version: portfolio.version,
    createdAt: portfolio.createdAt,
    updatedAt: portfolio.updatedAt,
    resetAt: portfolio.resetAt
  };
};

export const getPaperPortfolio = async (userId, { model = PaperPortfolio, getPrices = getBinancePrices } = {}) => {
  const portfolio = await ensurePaperPortfolio(userId, model);
  const prices = await getPrices((portfolio.holdings || []).map((holding) => holding.symbol));
  return makePortfolioSnapshot(portfolio, prices);
};

export const executePaperOrder = async (userId, order, { model = PaperPortfolio, getPrices = getBinancePrices, now = () => new Date() } = {}) => {
  validatePaperOrder(order);
  const normalized = {
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    quantity: order.quantity,
    amountUsdt: order.amountUsdt,
    orderId: order.orderId
  };
  const requestFingerprint = getOrderFingerprint(normalized);
  await ensurePaperPortfolio(userId, model);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    if (!current) throw new PaperTradingError('Paper portfolio could not be created. Please retry.', 503);
    if ((current.processedOrderIds || []).includes(normalized.orderId)) {
      const storedFingerprint = (current.processedOrderFingerprints || []).find((item) => item.orderId === normalized.orderId)?.fingerprint;
      if (storedFingerprint && storedFingerprint !== requestFingerprint) {
        throw new PaperTradingError('This idempotency key was already used for a different order.', 409);
      }
      const priceMap = await getPrices((current.holdings || []).map((holding) => holding.symbol));
      const trade = (current.trades || []).find((item) => item.orderId === normalized.orderId) || null;
      return { portfolio: makePortfolioSnapshot(current, priceMap), trade, duplicate: true };
    }

    const symbols = [...(current.holdings || []).map((holding) => holding.symbol), normalized.symbol];
    let prices;
    try {
      prices = await getPrices(symbols);
    } catch (error) {
      if (error.status === 400) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
      throw error;
    }
    const executionPrice = Number(prices?.[normalized.symbol]);
    if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
    if ((current.holdings || []).some((holding) => !Number.isFinite(Number(prices?.[holding.symbol])) || Number(prices[holding.symbol]) <= 0)) {
      throw new PaperTradingError('A live Binance price is not available for every open position.', 503);
    }
    const executionPriceUnits = toPriceUnits(executionPrice);
    if (executionPriceUnits <= 0n) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
    const authoritativePrice = priceUnitsToNumber(executionPriceUnits);
    const requestedAmountUnits = normalized.amountUsdt === undefined ? null : toAccountingUnits(normalized.amountUsdt);
    let quantityUnits = requestedAmountUnits === null
      ? toQuantityUnits(normalized.quantity)
      : (requestedAmountUnits * QUANTITY_SCALE) / executionPriceUnits;
    if (quantityUnits <= 0n) throw new PaperTradingError('The entered amount is too small to execute at this price.');

    let notionalUnits = marketValueUnits(quantityUnits, executionPriceUnits);
    if (requestedAmountUnits !== null && notionalUnits > requestedAmountUnits) {
      quantityUnits -= 1n;
      notionalUnits = marketValueUnits(quantityUnits, executionPriceUnits);
    }
    if (quantityUnits <= 0n || notionalUnits <= 0n) throw new PaperTradingError('The estimated order value is too small to execute.');
    if (requestedAmountUnits !== null && notionalUnits > requestedAmountUnits) throw new PaperTradingError('The order value cannot exceed the requested USDT amount.', 400);

    const quantity = quantityUnitsToNumber(quantityUnits);
    const notional = accountingUnitsToNumber(notionalUnits);
    const executedAt = now();
    const holdings = (current.holdings || []).map((holding) => ({ ...holding }));
    const index = holdings.findIndex((holding) => holding.symbol === normalized.symbol);
    let realizedPnlUnits = toAccountingUnits(current.realizedPnl || 0);
    let orderRealizedPnlUnits = 0n;
    let cashUnits = toAccountingUnits(current.cash);

    if (normalized.side === 'buy') {
      if (notionalUnits > cashUnits) throw new PaperTradingError('There is not enough paper cash for this order.');
      if (index < 0) holdings.push({ symbol: normalized.symbol, quantity, averageEntryPrice: authoritativePrice, openedAt: executedAt, updatedAt: executedAt });
      else {
        const holding = holdings[index];
        const oldQuantityUnits = toQuantityUnits(holding.quantity);
        const oldPriceUnits = toPriceUnits(holding.averageEntryPrice);
        const nextQuantityUnits = oldQuantityUnits + quantityUnits;
        const averagePriceUnits = divideRounded((oldQuantityUnits * oldPriceUnits) + (quantityUnits * executionPriceUnits), nextQuantityUnits);
        holding.averageEntryPrice = priceUnitsToNumber(averagePriceUnits);
        holding.quantity = quantityUnitsToNumber(nextQuantityUnits);
        holding.updatedAt = executedAt;
      }
      cashUnits -= notionalUnits;
    } else {
      if (index < 0 || toQuantityUnits(holdings[index].quantity) < quantityUnits) throw new PaperTradingError('There is not enough of this asset to sell.');
      const holding = holdings[index];
      const entryPriceUnits = toPriceUnits(holding.averageEntryPrice);
      orderRealizedPnlUnits = divideRounded((executionPriceUnits - entryPriceUnits) * quantityUnits, QUANTITY_SCALE);
      realizedPnlUnits += orderRealizedPnlUnits;
      cashUnits += notionalUnits;
      const remainingQuantityUnits = toQuantityUnits(holding.quantity) - quantityUnits;
      holding.quantity = quantityUnitsToNumber(remainingQuantityUnits);
      holding.updatedAt = executedAt;
      if (remainingQuantityUnits === 0n) holdings.splice(index, 1);
    }

    const cash = accountingUnitsToNumber(cashUnits);
    const realizedPnl = accountingUnitsToNumber(realizedPnlUnits);
    const orderRealizedPnl = accountingUnitsToNumber(orderRealizedPnlUnits);
    const updatedPrices = { ...prices, [normalized.symbol]: authoritativePrice };
    const portfolioValueAfterUnits = cashUnits + holdings.reduce((sum, holding) => (
      sum + marketValueUnits(toQuantityUnits(holding.quantity), toPriceUnits(updatedPrices[holding.symbol]))
    ), 0n);
    const portfolioValueAfter = accountingUnitsToNumber(portfolioValueAfterUnits);
    const trade = {
      orderId: normalized.orderId,
      requestFingerprint,
      symbol: normalized.symbol,
      side: normalized.side,
      quantity,
      executionPrice: authoritativePrice,
      notional,
      realizedPnl: orderRealizedPnl,
      cashAfter: cash,
      portfolioValueAfter,
      executedAt
    };

    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0, processedOrderIds: { $ne: normalized.orderId } },
      { $set: { cash, realizedPnl, holdings, trades: [...(current.trades || []), trade] }, $addToSet: {
        processedOrderIds: normalized.orderId,
        processedOrderFingerprints: { orderId: normalized.orderId, fingerprint: requestFingerprint }
      }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (updated) return { portfolio: makePortfolioSnapshot(updated, updatedPrices), trade, duplicate: false };
  }
  throw new PaperTradingError('The portfolio changed during this order. Please review the latest balance and try again.', 409);
};

export const resetPaperPortfolio = async (userId, { model = PaperPortfolio, now = () => new Date() } = {}) => {
  await ensurePaperPortfolio(userId, model);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    const resetAt = now();
    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0 },
      { $set: { cash: PAPER_INITIAL_BALANCE, realizedPnl: 0, holdings: [], trades: [], resetAt }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (updated) return makePortfolioSnapshot(updated);
  }
  throw new PaperTradingError('The portfolio changed during reset. Please try again.', 409);
};

export const getPaperPerformance = async (userId, options = {}) => {
  const portfolio = await getPaperPortfolio(userId, options);
  const baselineAt = portfolio.resetAt || portfolio.createdAt;
  const points = [{ time: baselineAt, value: portfolio.initialBalance, label: 'Starting balance' }];
  for (const trade of portfolio.trades) points.push({ time: trade.executedAt, value: trade.portfolioValueAfter, label: `${trade.side.toUpperCase()} ${trade.symbol}` });
  if (portfolio.equity !== null) points.push({ time: new Date(), value: portfolio.equity, label: 'Current market value' });
  return { points, currentValue: portfolio.equity, updatedAt: new Date().toISOString() };
};

export const paperTradingHelpers = Object.freeze({ makePortfolioSnapshot, MAX_CAS_ATTEMPTS });
