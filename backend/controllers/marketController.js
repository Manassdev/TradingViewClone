import { fetchBinanceJson, getCommunityMarketIdeas } from '../services/marketDataService.js';

const SUPPORTED_INTERVALS = new Set(['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M']);
const VALID_SYMBOL = /^[A-Z0-9]{2,20}$/;

const marketErrorStatus = (error) => {
  if (error.status === 429) return 503;
  if (error.status === 503) return 503;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 504;
  return 502;
};

const sendMarketError = (res, error) => {
  const status = marketErrorStatus(error);
  if (error.status === 429 || status === 503) res.set('Retry-After', '30');
  return res.status(status).json({
    success: false,
    message: status === 504 ? 'Market data request timed out. Please try again.' : 'Market data is temporarily unavailable.',
    ...(Array.isArray(error.unavailableSymbols) && { unavailableSymbols: error.unavailableSymbols })
  });
};

// @desc    Proxy Binance historical klines
// @route   GET /api/market/klines
// @access  Public
export const getKlines = async (req, res, next) => {
  try {
    const symbol = String(req.query.symbol || 'BTCUSDT').trim().toUpperCase();
    const interval = String(req.query.interval || '1h');
    const limit = Number(req.query.limit || 300);
    if (!VALID_SYMBOL.test(symbol)) return res.status(400).json({ success: false, message: 'A valid market symbol is required.' });
    if (!SUPPORTED_INTERVALS.has(interval)) return res.status(400).json({ success: false, message: 'The requested candle interval is not supported.' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return res.status(400).json({ success: false, message: 'Candle limit must be an integer from 1 to 1000.' });

    const data = await fetchBinanceJson('klines', { symbol, interval, limit });
    if (!Array.isArray(data)) throw new Error('Binance returned an unexpected candle response.');
    return res.json(data);
  } catch (err) {
    return sendMarketError(res, err);
  }
};

// @desc    Proxy Binance 24hr ticker quotes
// @route   GET /api/market/ticker
// @access  Public
export const getTicker24hr = async (req, res, next) => {
  try {
    const symbols = req.query.symbols;
    if (symbols !== undefined && (typeof symbols !== 'string' || symbols.length > 512)) {
      return res.status(400).json({ success: false, message: 'The symbols query is invalid or too long.' });
    }
    const data = await fetchBinanceJson('ticker/24hr', symbols ? { symbols } : {});
    return res.json(data);
  } catch (err) {
    return sendMarketError(res, err);
  }
};

// @desc Generate deterministic cryptocurrency ideas from Binance ticker and hourly candle data
// @route GET /api/market/ideas
// @access Public
export const getMarketIdeas = async (req, res) => {
  try {
    const payload = await getCommunityMarketIdeas();
    if (payload.meta.availableSymbols.length === 0) {
      const error = new Error('Market data is temporarily unavailable.');
      error.status = 503;
      return sendMarketError(res, error);
    }
    return res.json(payload);
  } catch (error) {
    return sendMarketError(res, error);
  }
};

// @desc    Get market classification & status
// @route   GET /api/market/status
// @access  Public
export const getMarketStatus = (req, res) => {
  res.json({
    success: true,
    dataSources: {
      crypto: {
        type: 'LIVE_API',
        provider: 'Binance REST & WebSockets',
        supported: true
      },
      stocks: {
        type: 'STATIC_MOCK',
        note: 'Equities and Indian stock details are demo datasets',
        supported: false
      },
      indices: {
        type: 'STATIC_MOCK',
        note: 'Global index prices are simulated',
        supported: false
      }
    }
  });
};
