import { getIndiaInstrument, getIndiaInstruments, searchIndiaInstruments } from '../services/indiaRegistry.js';
import { getIndiaCandles, getIndiaMarketStatus, getIndiaQuote, getIndiaQuotes, IndiaProviderError } from '../services/indiaDataService.js';

const sendError = (res, error) => {
  const status = error instanceof IndiaProviderError ? error.status : 502;
  if (status === 429) res.set('Retry-After', '60');
  return res.status(status).json({
    success: false,
    code: error.code || 'INDIA_PROVIDER_ERROR',
    message: error.message || 'Indian market data is temporarily unavailable.',
    ...(error.unavailableSymbols ? { unavailableSymbols: error.unavailableSymbols } : {})
  });
};

export const listIndiaInstruments = (req, res) => {
  const exchange = typeof req.query.exchange === 'string' ? req.query.exchange.toUpperCase() : undefined;
  const assetType = typeof req.query.assetType === 'string' ? req.query.assetType : undefined;
  if (exchange && !['NSE', 'BSE'].includes(exchange)) return res.status(400).json({ success: false, message: 'Exchange must be NSE or BSE.' });
  if (assetType && !['india_stock', 'india_index'].includes(assetType)) return res.status(400).json({ success: false, message: 'assetType must be india_stock or india_index.' });
  return res.json({ success: true, data: getIndiaInstruments({ exchange, assetType }), source: 'Configured instrument registry', currency: 'INR' });
};

export const searchIndia = (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length > 60) return res.status(400).json({ success: false, message: 'Search query must be 60 characters or fewer.' });
  return res.json({ success: true, data: searchIndiaInstruments(query) });
};

const parseInstrumentList = (raw) => {
  if (typeof raw !== 'string' || !raw.trim()) return getIndiaInstruments({ exchange: 'NSE', assetType: 'india_stock' });
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 20) return null;
  const unique = [...new Set(parts)];
  const resolved = unique.map((value) => {
    const [exchange, symbol, ...extra] = value.split(':');
    return extra.length ? null : getIndiaInstrument(exchange, symbol);
  });
  return resolved.every(Boolean) ? resolved : null;
};

export const getIndiaQuotesController = async (req, res) => {
  const instruments = parseInstrumentList(req.query.symbols);
  if (!instruments) return res.status(400).json({ success: false, message: 'Use 1–20 registered instruments in EXCHANGE:SYMBOL format.' });
  try {
    const result = await getIndiaQuotes(instruments);
    return res.json({ success: true, ...result, meta: { source: 'Twelve Data', delay: 'End-of-day (EOD)', currency: 'INR', generatedAt: new Date().toISOString() } });
  } catch (error) { return sendError(res, error); }
};

export const getIndiaQuoteController = async (req, res) => {
  try {
    const quote = await getIndiaQuote(req.params.exchange, req.params.symbol);
    return res.json({ success: true, data: quote });
  } catch (error) { return sendError(res, error); }
};

export const getIndiaCandlesController = async (req, res) => {
  const interval = String(req.query.interval || '1D');
  const limit = Number(req.query.limit || 180);
  try {
    const data = await getIndiaCandles(req.params.exchange, req.params.symbol, interval, limit);
    return res.json({ success: true, data });
  } catch (error) { return sendError(res, error); }
};

export const getIndiaIndices = async (_req, res) => {
  const indices = getIndiaInstruments({ assetType: 'india_index' });
  try {
    const result = await getIndiaQuotes(indices);
    return res.json({ success: true, ...result, meta: { source: 'Twelve Data', delay: 'End-of-day (EOD)', currency: 'INR', generatedAt: new Date().toISOString() } });
  } catch (error) { return sendError(res, error); }
};

export const getIndiaMarketStatusController = (_req, res) => res.json({
  success: true,
  data: ['NSE', 'BSE'].map((exchange) => getIndiaMarketStatus(exchange)),
  source: 'Configured India trading calendar'
});

export const getIndiaAnalytics = async (_req, res) => {
  const instruments = getIndiaInstruments({ exchange: 'NSE', assetType: 'india_stock' });
  try {
    const result = await getIndiaQuotes(instruments);
    const usable = result.data.filter((quote) => !quote.isStale && Number.isFinite(quote.changePercent));
    const sectors = new Map();
    for (const quote of usable) {
      const entry = sectors.get(quote.sector) || { sector: quote.sector, sum: 0, count: 0 };
      entry.sum += quote.changePercent;
      entry.count += 1;
      sectors.set(quote.sector, entry);
    }
    return res.json({
      success: true,
      data: {
        gainers: [...usable].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
        losers: [...usable].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
        mostActive: [...usable].filter((quote) => Number.isFinite(quote.volume)).sort((a, b) => b.volume - a.volume).slice(0, 5),
        sectorPerformance: [...sectors.values()].map((entry) => ({ sector: entry.sector, averageChangePercent: entry.sum / entry.count, constituents: entry.count })).sort((a, b) => b.averageChangePercent - a.averageChangePercent),
        period: 'Provider-reported daily percentage change; sector result is the unweighted mean of the configured sample instruments, not an official index.',
        source: 'Twelve Data',
        delay: 'End-of-day (EOD)',
        errors: result.errors
      }
    });
  } catch (error) { return sendError(res, error); }
};
