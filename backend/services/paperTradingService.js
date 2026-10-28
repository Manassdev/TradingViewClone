import { createHash } from 'node:crypto';
import PaperPortfolio from '../models/PaperPortfolio.js';
import { fetchBinanceJson } from './marketDataService.js';

const configuredInitialBalance = Number(process.env.PAPER_INITIAL_BALANCE || 100_000);
export const PAPER_INITIAL_BALANCE = Number.isFinite(configuredInitialBalance) && configuredInitialBalance > 0 && configuredInitialBalance <= 10_000_000
  ? Math.round(configuredInitialBalance * 100) / 100
  : 100_000;
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
const getConfiguredInitialBalance = () => {
  const value = Number(process.env.PAPER_INITIAL_BALANCE || PAPER_INITIAL_BALANCE);
  return Number.isFinite(value) && value > 0 && value <= 10_000_000
    ? Math.round(value * 100) / 100
    : PAPER_INITIAL_BALANCE;
};

export class PaperTradingError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'PaperTradingError'; this.status = status; }
}

export const validatePaperOrder = (order = {}) => {
  const { symbol, side, quantity, amountUsdt, orderId } = order || {};
  const orderType = order.orderType || 'market';
  if (typeof symbol !== 'string' || !VALID_SYMBOL.test(symbol)) throw new PaperTradingError('Enter a valid Binance USDT trading pair.');
  if (!['buy', 'sell'].includes(side)) throw new PaperTradingError('Order side must be buy or sell.');
  if (!['market', 'limit'].includes(orderType)) throw new PaperTradingError('Only market and limit paper orders are supported.');
  if (orderType === 'limit' && (typeof order.limitPrice !== 'number' || !Number.isFinite(order.limitPrice) || order.limitPrice <= 0 || order.limitPrice > 1_000_000_000 || Number(order.limitPrice.toFixed(8)) !== order.limitPrice)) {
    throw new PaperTradingError('Enter a valid positive limit price.');
  }
  if (orderType === 'market' && order.limitPrice !== undefined) throw new PaperTradingError('A market order cannot include a limit price.');
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
  orderType: order.orderType || 'market',
  limitPrice: order.limitPrice ?? null,
  quantity: order.quantity ?? null,
  amountUsdt: order.amountUsdt ?? null
})).digest('hex');

export const ensurePaperPortfolio = async (userId, model = PaperPortfolio) => {
  try {
    return await model.findOneAndUpdate(
      userFilter(userId),
      { $setOnInsert: { userId, initialBalance: getConfiguredInitialBalance(), cash: getConfiguredInitialBalance(), realizedPnl: 0, holdings: [], trades: [], orders: [], processedOrderIds: [], processedOrderFingerprints: [], version: 0, resetAt: new Date() } },
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

const makePortfolioSnapshot = (portfolio, prices = {}, { pricesAt = null, valuationStatus = 'live' } = {}) => {
  const pendingOrders = (portfolio.orders || []).filter((order) => order.status === 'pending');
  const realizedBySymbol = new Map();
  for (const trade of portfolio.trades || []) {
    realizedBySymbol.set(trade.symbol, (realizedBySymbol.get(trade.symbol) || 0) + Number(trade.realizedPnl || 0));
  }
  const holdings = (portfolio.holdings || []).map((item) => {
    const lastPrice = prices[item.symbol] ?? null;
    const quantityUnits = toQuantityUnits(item.quantity);
    const marketValueUnitsValue = lastPrice === null ? null : marketValueUnits(quantityUnits, toPriceUnits(lastPrice));
    const costBasisUnits = marketValueUnits(quantityUnits, toPriceUnits(item.averageEntryPrice));
    const unrealizedPnlUnits = marketValueUnitsValue === null ? null : marketValueUnitsValue - costBasisUnits;
    const reservedQuantity = pendingOrders
      .filter((order) => order.side === 'sell' && order.symbol === item.symbol)
      .reduce((sum, order) => sum + Number(order.quantity), 0);
    return {
      ...item,
      assetType: 'crypto',
      direction: 'long',
      availableQuantity: Math.max(0, roundAccounting(Number(item.quantity) - reservedQuantity)),
      realizedPnl: roundAccounting(realizedBySymbol.get(item.symbol) || 0),
      lastPrice,
      marketValue: marketValueUnitsValue === null ? null : accountingUnitsToNumber(marketValueUnitsValue),
      unrealizedPnl: unrealizedPnlUnits === null ? null : accountingUnitsToNumber(unrealizedPnlUnits),
      unrealizedPnlPercent: lastPrice === null || Number(item.averageEntryPrice) <= 0
        ? null
        : roundAccounting(((lastPrice - Number(item.averageEntryPrice)) / Number(item.averageEntryPrice)) * 100)
    };
  });
  const priced = holdings.every((item) => item.marketValue !== null);
  const effectiveValuationStatus = valuationStatus === 'live' && !priced ? 'partial' : valuationStatus;
  const equityUnits = priced
    ? toAccountingUnits(portfolio.cash) + holdings.reduce((sum, item) => sum + toAccountingUnits(item.marketValue), 0n)
    : null;
  const equity = equityUnits === null ? null : accountingUnitsToNumber(equityUnits);
  const unrealizedPnlUnits = priced ? holdings.reduce((sum, item) => sum + toAccountingUnits(item.unrealizedPnl), 0n) : null;
  const unrealizedPnl = unrealizedPnlUnits === null ? null : accountingUnitsToNumber(unrealizedPnlUnits);
  const initialBalance = Number.isFinite(Number(portfolio.initialBalance)) && Number(portfolio.initialBalance) > 0
    ? Number(portfolio.initialBalance)
    : PAPER_INITIAL_BALANCE;
  const totalPnlUnits = equityUnits === null ? null : equityUnits - toAccountingUnits(initialBalance);
  const totalPnl = totalPnlUnits === null ? null : accountingUnitsToNumber(totalPnlUnits);
  const reservedCash = roundAccounting(pendingOrders
    .filter((order) => order.side === 'buy')
    .reduce((sum, order) => sum + (Number(order.quantity) * Number(order.limitPrice)), 0));
  return {
    initialBalance,
    cash: portfolio.cash,
    availableCash: Math.max(0, roundAccounting(Number(portfolio.cash) - reservedCash)),
    reservedCash,
    holdings,
    realizedPnl: portfolio.realizedPnl,
    unrealizedPnl,
    equity,
    totalPnl,
    totalReturnPercent: totalPnlUnits === null ? null : roundAccounting((Number(totalPnlUnits) / Number(ACCOUNTING_SCALE) / initialBalance) * 100),
    trades: portfolio.trades || [],
    orders: portfolio.orders || [],
    marketDataStatus: effectiveValuationStatus,
    pricesAsOf: pricesAt,
    version: portfolio.version,
    createdAt: portfolio.createdAt,
    updatedAt: portfolio.updatedAt,
    resetAt: portfolio.resetAt
  };
};

export const getPaperPortfolio = async (userId, { model = PaperPortfolio, getPrices = getBinancePrices } = {}) => {
  try { await evaluatePendingPaperOrders(userId, { model, getPrices }); } catch { /* Keep persisted account access available during feed outages. */ }
  const portfolio = await ensurePaperPortfolio(userId, model);
  try {
    const prices = await getPrices((portfolio.holdings || []).map((holding) => holding.symbol));
    return makePortfolioSnapshot(portfolio, prices || {}, { pricesAt: new Date(), valuationStatus: 'live' });
  } catch {
    return makePortfolioSnapshot(portfolio, {}, { valuationStatus: 'unavailable' });
  }
};

export const executePaperOrder = async (userId, order, { model = PaperPortfolio, getPrices = getBinancePrices, now = () => new Date(), evaluateLimit = false, expectedFingerprint } = {}) => {
  validatePaperOrder(order);
  const normalized = {
    symbol: order.symbol.toUpperCase(),
    side: order.side,
    orderType: order.orderType || 'market',
    limitPrice: order.limitPrice,
    quantity: order.quantity,
    amountUsdt: order.amountUsdt,
    orderId: order.orderId
  };
  if (normalized.orderType === 'limit' && !evaluateLimit) throw new PaperTradingError('Limit orders must be placed as pending orders.');
  const requestFingerprint = evaluateLimit && typeof expectedFingerprint === 'string'
    ? expectedFingerprint
    : getOrderFingerprint(normalized);
  await ensurePaperPortfolio(userId, model);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    if (!current) throw new PaperTradingError('Paper portfolio could not be created. Please retry.', 503);
    const orderRecord = normalized.orderType === 'limit'
      ? (current.orders || []).find((item) => item.orderId === normalized.orderId && item.orderType === 'limit')
      : null;
    const pendingLimit = orderRecord?.status === 'pending' ? orderRecord : null;
    if ((current.processedOrderIds || []).includes(normalized.orderId)) {
      const storedFingerprint = (current.processedOrderFingerprints || []).find((item) => item.orderId === normalized.orderId)?.fingerprint;
      if (storedFingerprint && storedFingerprint !== requestFingerprint) {
        throw new PaperTradingError('This idempotency key was already used for a different order.', 409);
      }
      if (!(pendingLimit && normalized.orderType === 'limit' && evaluateLimit)) {
        const priceMap = await getPrices((current.holdings || []).map((holding) => holding.symbol)).catch(() => ({}));
        const trade = (current.trades || []).find((item) => item.orderId === normalized.orderId) || null;
        return { portfolio: makePortfolioSnapshot(current, priceMap || {}, { pricesAt: now() }), trade, order: orderRecord, duplicate: true };
      }
    }
    if (normalized.orderType === 'limit' && !evaluateLimit) throw new PaperTradingError('Limit orders must be placed as pending orders.');
    if (normalized.orderType === 'limit' && (!pendingLimit || pendingLimit.requestFingerprint !== requestFingerprint)) {
      throw new PaperTradingError('This pending limit order is no longer available.', 409);
    }

    const symbols = [...(current.holdings || []).map((holding) => holding.symbol), normalized.symbol];
    let prices;
    try {
      prices = await getPrices(symbols);
    } catch (error) {
      if (error.status === 400) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
      throw error;
    }
    const marketPrice = Number(prices?.[normalized.symbol]);
    if (!Number.isFinite(marketPrice) || marketPrice <= 0) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
    if (pendingLimit && !(normalized.side === 'buy' ? marketPrice <= normalized.limitPrice : marketPrice >= normalized.limitPrice)) {
      return { portfolio: makePortfolioSnapshot(current, prices, { pricesAt: now() }), order: pendingLimit, pending: true, duplicate: false };
    }
    if ((current.holdings || []).some((holding) => !Number.isFinite(Number(prices?.[holding.symbol])) || Number(prices[holding.symbol]) <= 0)) {
      throw new PaperTradingError('A live Binance price is not available for every open position.', 503);
    }
    // A crossed limit order fills conservatively at its limit; the simulator does
    // not model order-book liquidity or price improvement from last-trade data.
    const executionPriceUnits = toPriceUnits(pendingLimit ? normalized.limitPrice : marketPrice);
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
    let entryPriceForTrade = authoritativePrice;
    let entryAtForTrade = executedAt;
    const pendingOrders = (current.orders || []).filter((item) => item.status === 'pending');
    const reservedCashUnits = pendingOrders
      .filter((item) => item.side === 'buy' && item.orderId !== normalized.orderId)
      .reduce((sum, item) => sum + marketValueUnits(toQuantityUnits(item.quantity), toPriceUnits(item.limitPrice)), 0n);

    if (normalized.side === 'buy') {
      if (notionalUnits + reservedCashUnits > cashUnits) throw new PaperTradingError('There is not enough paper cash available after pending buy orders.');
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
      const reservedQuantityUnits = pendingOrders
        .filter((item) => item.side === 'sell' && item.symbol === normalized.symbol && item.orderId !== normalized.orderId)
        .reduce((sum, item) => sum + toQuantityUnits(item.quantity), 0n);
      if (index < 0 || toQuantityUnits(holdings[index].quantity) - reservedQuantityUnits < quantityUnits) {
        throw new PaperTradingError('There is not enough of this asset available after pending sell orders.');
      }
      const holding = holdings[index];
      const entryPriceUnits = toPriceUnits(holding.averageEntryPrice);
      entryPriceForTrade = priceUnitsToNumber(entryPriceUnits);
      entryAtForTrade = holding.openedAt;
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
    const updatedPrices = { ...prices };
    const portfolioValueAfterUnits = cashUnits + holdings.reduce((sum, holding) => (
      sum + marketValueUnits(toQuantityUnits(holding.quantity), toPriceUnits(updatedPrices[holding.symbol]))
    ), 0n);
    const portfolioValueAfter = accountingUnitsToNumber(portfolioValueAfterUnits);
    const trade = {
      orderId: normalized.orderId,
      requestFingerprint,
      orderType: pendingLimit ? 'limit' : 'market',
      ...(pendingLimit ? { limitPrice: pendingLimit.limitPrice } : {}),
      assetType: 'crypto',
      symbol: normalized.symbol,
      side: normalized.side,
      quantity,
      entryPrice: entryPriceForTrade,
      entryAt: entryAtForTrade,
      executionPrice: authoritativePrice,
      notional,
      realizedPnl: orderRealizedPnl,
      cashAfter: cash,
      portfolioValueAfter,
      executedAt
    };
    const updatedOrders = (current.orders || []).map((item) => item.orderId === normalized.orderId && item.status === 'pending'
      ? { ...item, status: 'filled', executionPrice: authoritativePrice, filledAt: executedAt, updatedAt: executedAt }
      : item);

    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0, ...(pendingLimit ? {} : { processedOrderIds: { $ne: normalized.orderId } }) },
      { $set: { cash, realizedPnl, holdings, trades: [...(current.trades || []), trade], orders: updatedOrders }, $addToSet: {
        processedOrderIds: normalized.orderId,
        processedOrderFingerprints: { orderId: normalized.orderId, fingerprint: requestFingerprint }
      }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (updated) return { portfolio: makePortfolioSnapshot(updated, updatedPrices), trade, duplicate: false };
  }
  throw new PaperTradingError('The portfolio changed during this order. Please review the latest balance and try again.', 409);
};

export const placePaperLimitOrder = async (userId, order, { model = PaperPortfolio, getPrices = getBinancePrices, now = () => new Date() } = {}) => {
  validatePaperOrder({ ...order, orderType: 'limit' });
  const normalized = {
    symbol: order.symbol.toUpperCase(), side: order.side, orderType: 'limit',
    limitPrice: order.limitPrice, quantity: order.quantity, amountUsdt: order.amountUsdt, orderId: order.orderId
  };
  const fingerprint = getOrderFingerprint(normalized);
  await ensurePaperPortfolio(userId, model);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    if (!current) throw new PaperTradingError('Paper portfolio could not be created. Please retry.', 503);
    const previous = (current.orders || []).find((item) => item.orderId === normalized.orderId);
    if (previous || (current.processedOrderIds || []).includes(normalized.orderId)) {
      const saved = (current.processedOrderFingerprints || []).find((item) => item.orderId === normalized.orderId)?.fingerprint || previous?.requestFingerprint;
      if (saved && saved !== fingerprint) throw new PaperTradingError('This idempotency key was already used for a different order.', 409);
      return { portfolio: makePortfolioSnapshot(current, {}, { valuationStatus: 'unavailable' }), order: previous || null, duplicate: true };
    }
    let prices;
    const symbols = [...new Set([normalized.symbol, ...(current.holdings || []).map((holding) => holding.symbol)])];
    try { prices = await getPrices(symbols); }
    catch (error) {
      if (error.status === 400) throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
      throw error;
    }
    if (!Number.isFinite(Number(prices?.[normalized.symbol])) || Number(prices[normalized.symbol]) <= 0) {
      throw new PaperTradingError('This trading pair is not available on Binance spot.', 400);
    }
    const priceUnits = toPriceUnits(normalized.limitPrice);
    const requestedAmountUnits = normalized.amountUsdt === undefined ? null : toAccountingUnits(normalized.amountUsdt);
    let quantityUnits = requestedAmountUnits === null
      ? toQuantityUnits(normalized.quantity)
      : (requestedAmountUnits * QUANTITY_SCALE) / priceUnits;
    if (quantityUnits <= 0n) throw new PaperTradingError('The entered amount is too small at this limit price.');
    let reserveUnits = marketValueUnits(quantityUnits, priceUnits);
    if (requestedAmountUnits !== null && reserveUnits > requestedAmountUnits) {
      quantityUnits -= 1n;
      reserveUnits = marketValueUnits(quantityUnits, priceUnits);
    }
    if (quantityUnits <= 0n || quantityUnits > toQuantityUnits(1_000_000) || (requestedAmountUnits !== null && reserveUnits > requestedAmountUnits)) {
      throw new PaperTradingError('The limit order quantity or value is outside the supported range.');
    }
    const quantity = quantityUnitsToNumber(quantityUnits);
    const pendingOrders = (current.orders || []).filter((item) => item.status === 'pending');
    const reservedCashUnits = pendingOrders.filter((item) => item.side === 'buy')
      .reduce((sum, item) => sum + marketValueUnits(toQuantityUnits(item.quantity), toPriceUnits(item.limitPrice)), 0n);
    if (normalized.side === 'buy' && reservedCashUnits + reserveUnits > toAccountingUnits(current.cash)) {
      throw new PaperTradingError('There is not enough paper cash available after pending buy orders.');
    }
    if (normalized.side === 'sell') {
      const holding = (current.holdings || []).find((item) => item.symbol === normalized.symbol);
      const reservedQuantityUnits = pendingOrders.filter((item) => item.side === 'sell' && item.symbol === normalized.symbol)
        .reduce((sum, item) => sum + toQuantityUnits(item.quantity), 0n);
      if (!holding || toQuantityUnits(holding.quantity) - reservedQuantityUnits < quantityUnits) {
        throw new PaperTradingError('There is not enough of this asset available after pending sell orders.');
      }
    }
    const createdAt = now();
    const pendingOrder = {
      ...normalized, quantity, requestFingerprint: fingerprint, status: 'pending', createdAt, updatedAt: createdAt
    };
    const updatedOrders = [...(current.orders || []), pendingOrder];
    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0, processedOrderIds: { $ne: normalized.orderId } },
      { $set: { orders: updatedOrders }, $addToSet: {
        processedOrderIds: normalized.orderId,
        processedOrderFingerprints: { orderId: normalized.orderId, fingerprint }
      }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (updated) return { portfolio: makePortfolioSnapshot(updated, prices, { pricesAt: createdAt }), order: pendingOrder, duplicate: false };
  }
  throw new PaperTradingError('The portfolio changed while placing this limit order. Review the latest account and try again.', 409);
};

export const cancelPaperOrder = async (userId, orderId, { model = PaperPortfolio, getPrices = getBinancePrices, now = () => new Date() } = {}) => {
  try { await evaluatePendingPaperOrders(userId, { model, getPrices, now }); } catch { /* A feed outage must not block cancellation. */ }
  await ensurePaperPortfolio(userId, model);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    if (!current) throw new PaperTradingError('Paper portfolio could not be found.', 404);
    const orderIndex = (current.orders || []).findIndex((item) => item.orderId === orderId);
    if (orderIndex < 0) throw new PaperTradingError('Paper order was not found.', 404);
    if (current.orders[orderIndex].status !== 'pending') throw new PaperTradingError('Only pending limit orders can be cancelled.', 409);
    const cancelledAt = now();
    const orders = current.orders.map((item, index) => index === orderIndex
      ? { ...item, status: 'cancelled', cancelledAt, updatedAt: cancelledAt }
      : item);
    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0 },
      { $set: { orders }, $inc: { version: 1 } },
      { new: true, runValidators: true }
    ).lean();
    if (updated) {
      try {
        const prices = await getPrices((updated.holdings || []).map((item) => item.symbol));
        return makePortfolioSnapshot(updated, prices || {}, { pricesAt: now(), valuationStatus: 'live' });
      } catch {
        return makePortfolioSnapshot(updated, {}, { valuationStatus: 'unavailable' });
      }
    }
  }
  throw new PaperTradingError('The portfolio changed while cancelling this order. Refresh and try again.', 409);
};

export const evaluatePendingPaperOrders = async (userId, options = {}) => {
  const { model = PaperPortfolio, getPrices = getBinancePrices, now = () => new Date() } = options;
  const portfolio = await ensurePaperPortfolio(userId, model);
  for (const order of (portfolio.orders || []).filter((item) => item.status === 'pending')) {
    try {
      await executePaperOrder(userId, {
        symbol: order.symbol, side: order.side, orderType: 'limit', limitPrice: Number(order.limitPrice),
        quantity: Number(order.quantity), orderId: order.orderId
      }, { model, getPrices, now, evaluateLimit: true, expectedFingerprint: order.requestFingerprint });
    } catch (error) {
      if (!(error instanceof PaperTradingError) || error.status !== 409) throw error;
    }
  }
  return model.findOne(userFilter(userId)).lean();
};

export const resetPaperPortfolio = async (userId, { model = PaperPortfolio, now = () => new Date() } = {}) => {
  await ensurePaperPortfolio(userId, model);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await model.findOne(userFilter(userId)).lean();
    const resetAt = now();
    const updated = await model.findOneAndUpdate(
      { ...userFilter(userId), version: current.version || 0 },
      { $set: { initialBalance: Number(current.initialBalance) > 0 ? Number(current.initialBalance) : PAPER_INITIAL_BALANCE, cash: Number(current.initialBalance) > 0 ? Number(current.initialBalance) : PAPER_INITIAL_BALANCE, realizedPnl: 0, holdings: [], trades: [], orders: [], resetAt }, $inc: { version: 1 } },
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
