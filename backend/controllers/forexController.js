import { getForexPair, getForexPairs, searchForexPairs } from '../services/forexRegistry.js';
import { getForexCandles, getForexQuote, getForexQuotes, ForexProviderError } from '../services/forexDataService.js';

const TIMEFRAMES = Object.freeze({
  '1m': '1min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', '1D': '1day', '1W': '1week', '1M': '1month'
});
const outputSizeFor = Object.freeze({ '1D': 30, '1W': 52, '1M': 60 });

const sendError = (res, error) => {
  const known = error instanceof ForexProviderError;
  const status = known ? error.status : 502;
  if (status === 429) res.set('Retry-After', '60');
  return res.status(status).json({ success: false, code: known ? error.code : 'FOREX_PROVIDER_ERROR', message: known ? error.message : 'Forex provider is temporarily unavailable.' });
};

const strengthFor = (quotes) => {
  const totals = new Map();
  for (const quote of quotes) {
    const change = Number(quote.changePercent);
    if (!Number.isFinite(change)) continue;
    const inverseContribution = change > -100 ? (-change / (100 + change)) * 100 : -change;
    for (const [currency, contribution] of [[quote.base, change], [quote.quote, inverseContribution]]) {
      const entry = totals.get(currency) || { sum: 0, pairs: 0 };
      entry.sum += contribution;
      entry.pairs += 1;
      totals.set(currency, entry);
    }
  }
  return [...totals.entries()].filter(([, entry]) => entry.pairs >= 2)
    .map(([currency, entry]) => ({ currency, averageContributionPercent: entry.sum / entry.pairs, pairCount: entry.pairs }))
    .sort((a, b) => b.averageContributionPercent - a.averageContributionPercent);
};

export const listForexPairs = (_req, res) => res.json({ success: true, data: getForexPairs(), source: 'Twelve Data' });

export const searchForex = (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length > 40) return res.status(400).json({ success: false, message: 'Search query must be 40 characters or fewer.' });
  return res.json({ success: true, data: searchForexPairs(query) });
};

export const getForexQuotesController = async (req, res) => {
  try {
    const raw = typeof req.query.symbols === 'string' ? req.query.symbols : '';
    const symbols = raw ? [...new Set(raw.split(',').map((symbol) => symbol.trim()).filter(Boolean))] : getForexPairs().filter((pair) => pair.category === 'major').map((pair) => pair.symbol);
    if (!symbols.length || symbols.length > 20 || symbols.some((symbol) => !getForexPair(symbol))) {
      return res.status(400).json({ success: false, message: 'Request 1–20 supported Forex pair symbols.' });
    }
    const result = await getForexQuotes(symbols);
    const sorted = [...result.data].sort((a, b) => Math.abs(b.changePercent || 0) - Math.abs(a.changePercent || 0));
    return res.json({
      success: true,
      data: result.data,
      errors: result.errors,
      meta: {
        source: 'Twelve Data',
        generatedAt: new Date().toISOString(),
        mostActive: sorted.slice(0, 5).map((row) => row.symbol),
        gainers: [...result.data].filter((row) => Number.isFinite(row.changePercent)).sort((a, b) => b.changePercent - a.changePercent).slice(0, 5).map((row) => row.symbol),
        losers: [...result.data].filter((row) => Number.isFinite(row.changePercent)).sort((a, b) => a.changePercent - b.changePercent).slice(0, 5).map((row) => row.symbol),
        period: 'provider-reported daily percentage change'
      }
    });
  } catch (error) { return sendError(res, error); }
};

export const getForexQuoteController = async (req, res) => {
  try {
    const quote = await getForexQuote(req.params.symbol);
    return res.json({ success: true, data: quote });
  } catch (error) { return sendError(res, error); }
};

export const getForexCandlesController = async (req, res) => {
  try {
    const pair = getForexPair(req.params.symbol);
    if (!pair) return res.status(404).json({ success: false, code: 'UNSUPPORTED_PAIR', message: 'Unsupported Forex pair.' });
    const timeframe = req.query.interval || '1h';
    const interval = TIMEFRAMES[timeframe];
    if (!interval) return res.status(400).json({ success: false, message: `Unsupported timeframe. Use ${Object.keys(TIMEFRAMES).join(', ')}.` });
    const defaultLimit = outputSizeFor[timeframe] || 300;
    const limit = Number(req.query.limit ?? defaultLimit);
    if (!Number.isInteger(limit) || limit < 10 || limit > 500) return res.status(400).json({ success: false, message: 'Candle limit must be an integer from 10 to 500.' });
    const result = await getForexCandles(pair.symbol, interval, limit);
    return res.json({ success: true, data: result });
  } catch (error) { return sendError(res, error); }
};

export const getForexAnalyticsController = async (req, res) => {
  try {
    const pair = getForexPair(req.params.symbol);
    if (!pair) return res.status(404).json({ success: false, code: 'UNSUPPORTED_PAIR', message: 'Unsupported Forex pair.' });
    const period = String(req.query.period || '1m');
    const periodLimits = { '1w': 7, '1m': 30, '3m': 90, '1y': 252 };
    if (!periodLimits[period]) return res.status(400).json({ success: false, message: 'Period must be 1w, 1m, 3m, or 1y.' });
    const [history, quoteResult, comparisonHistory] = await Promise.all([
      getForexCandles(pair.symbol, '1day', periodLimits[period]),
      getForexQuotes(getForexPairs().filter((item) => item.category === 'major').map((item) => item.symbol)),
      req.query.compare ? getForexPair(req.query.compare) ? getForexCandles(req.query.compare, '1day', periodLimits[period]) : Promise.reject(new ForexProviderError('Comparison pair is not supported.', 400, 'UNSUPPORTED_PAIR')) : Promise.resolve(null)
    ]);
    const candles = history.candles;
    const first = candles[0];
    const last = candles.at(-1);
    const high = Math.max(...candles.map((candle) => candle.high));
    const low = Math.min(...candles.map((candle) => candle.low));
    const pctChange = first && last && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null;
    const comparison = comparisonHistory ? {
      symbol: comparisonHistory.symbol,
      periodChangePercent: comparisonHistory.candles[0]?.open > 0 && comparisonHistory.candles.at(-1)
        ? ((comparisonHistory.candles.at(-1).close - comparisonHistory.candles[0].open) / comparisonHistory.candles[0].open) * 100
        : null
    } : null;
    return res.json({ success: true, data: {
      symbol: pair.symbol,
      period,
      periodChangePercent: pctChange,
      periodHigh: high,
      periodLow: low,
      candlesCount: candles.length,
      comparison,
      currencyStrength: strengthFor(quoteResult.data),
      currencyStrengthMethod: 'Mean of provider-reported daily pair returns: add each return to its base currency and use the mathematically inverted return for its quote currency; show currencies with at least two contributing major pairs.',
      currencyStrengthPairCount: quoteResult.data.length,
      source: 'Twelve Data',
      updatedAt: history.updatedAt
    } });
  } catch (error) { return sendError(res, error); }
};
