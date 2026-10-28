import { getForexPair } from './forexRegistry.js';

const API_BASE = 'https://api.twelvedata.com';
const QUOTE_TTL_MS = 60_000;
const CANDLE_TTL_MS = 5 * 60_000;
const QUOTE_STALE_AFTER_MS = 5 * 60_000;
const cache = new Map();

export class ForexProviderError extends Error {
  constructor(message, status = 503, code = 'FOREX_PROVIDER_ERROR') {
    super(message);
    this.name = 'ForexProviderError';
    this.status = status;
    this.code = code;
  }
}

const parseTimestamp = (value) => {
  if (typeof value !== 'string') return null;
  const utcValue = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value;
  const parsed = Date.parse(utcValue);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const numberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getApiKey = () => {
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!key) throw new ForexProviderError('Forex data is not configured. Set TWELVE_DATA_API_KEY in backend/.env.', 503, 'MISSING_API_KEY');
  return key;
};

const requestProvider = async (path, params) => {
  const key = getApiKey();
  const url = new URL(path, API_BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  url.searchParams.set('apikey', key);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } });
    } catch (error) {
      if (attempt === 0 && (error.name === 'TimeoutError' || error.name === 'AbortError')) continue;
      throw new ForexProviderError('Forex provider request timed out or could not connect.', 504, 'PROVIDER_TIMEOUT');
    }

    let payload;
    try { payload = await response.json(); }
    catch { throw new ForexProviderError('Forex provider returned unreadable data.', 502, 'INVALID_PROVIDER_RESPONSE'); }

    if (response.status === 429 || payload?.code === 429) {
      throw new ForexProviderError('Forex provider rate limit reached. Wait before refreshing market data.', 429, 'PROVIDER_RATE_LIMIT');
    }
    if (response.status >= 500 && attempt === 0) continue;
    if (!response.ok || payload?.status === 'error' || payload?.code) {
      const status = response.status === 401 || response.status === 403 ? 503 : 502;
      const message = status === 503
        ? 'Forex provider rejected the API key or data entitlement. Check your Twelve Data account and plan.'
        : 'Forex provider could not return the requested market data.';
      throw new ForexProviderError(message, status, 'PROVIDER_REJECTED');
    }
    return payload;
  }
  throw new ForexProviderError('Forex provider is temporarily unavailable.', 502, 'PROVIDER_UNAVAILABLE');
};

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { cache.delete(key); return null; }
  return entry.value;
};

const cacheSet = (key, value, ttl) => {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [entryKey, entry] of cache) if (entry.expiresAt <= now) cache.delete(entryKey);
  }
};

const normalizeQuote = (pair, payload) => {
  const rate = numberOrNull(payload.close ?? payload.price);
  const updatedAt = parseTimestamp(payload.datetime || payload.timestamp || payload.last_updated);
  if (!(rate > 0) || !updatedAt) throw new ForexProviderError('Forex provider returned an incomplete quote.', 502, 'INVALID_QUOTE');
  const ageMs = Date.now() - Date.parse(updatedAt);
  const sessionOpen = payload.is_market_open === true || payload.is_market_open === 'true';
  return {
    ...pair,
    rate,
    change: numberOrNull(payload.change),
    changePercent: numberOrNull(payload.percent_change),
    open: numberOrNull(payload.open),
    high: numberOrNull(payload.high),
    low: numberOrNull(payload.low),
    previousClose: numberOrNull(payload.previous_close),
    bid: numberOrNull(payload.bid),
    ask: numberOrNull(payload.ask),
    spread: numberOrNull(payload.spread),
    sessionStatus: typeof payload.is_market_open === 'boolean' || typeof payload.is_market_open === 'string' ? (sessionOpen ? 'open' : 'closed') : 'unknown',
    provider: 'Twelve Data',
    quoteType: 'composite forex rate',
    updatedAt,
    isStale: ageMs > QUOTE_STALE_AFTER_MS
  };
};

export const getForexQuote = async (symbol) => {
  const pair = getForexPair(symbol);
  if (!pair) throw new ForexProviderError('Unsupported Forex pair.', 404, 'UNSUPPORTED_PAIR');
  const key = `quote:${pair.symbol}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const payload = await requestProvider('/quote', { symbol: pair.providerSymbol, timezone: 'UTC' });
  const quote = normalizeQuote(pair, payload);
  cacheSet(key, quote, QUOTE_TTL_MS);
  return { ...quote, cached: false };
};

export const getForexQuotes = async (symbols) => {
  const results = await Promise.allSettled(symbols.map((symbol) => getForexQuote(symbol)));
  const data = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
  const errors = results.flatMap((result, index) => result.status === 'rejected' ? [{
    symbol: symbols[index],
    message: result.reason instanceof ForexProviderError ? result.reason.message : 'Forex provider request failed.',
    status: result.reason?.status || 502
  }] : []);
  if (!data.length && errors.length) {
    const first = results.find((result) => result.status === 'rejected').reason;
    throw first instanceof ForexProviderError ? first : new ForexProviderError('Forex provider request failed.', 502);
  }
  return { data, errors };
};

export const getForexCandles = async (symbol, interval = '1h', outputsize = 300) => {
  const pair = getForexPair(symbol);
  if (!pair) throw new ForexProviderError('Unsupported Forex pair.', 404, 'UNSUPPORTED_PAIR');
  const key = `candles:${pair.symbol}:${interval}:${outputsize}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const payload = await requestProvider('/time_series', {
    symbol: pair.providerSymbol,
    interval,
    outputsize,
    timezone: 'UTC',
    order: 'ASC'
  });
  if (!Array.isArray(payload.values)) throw new ForexProviderError('Forex provider returned no candle history.', 502, 'INVALID_CANDLES');
  const values = payload.values.map((row) => ({
    time: parseTimestamp(row.datetime),
    open: numberOrNull(row.open),
    high: numberOrNull(row.high),
    low: numberOrNull(row.low),
    close: numberOrNull(row.close)
  })).filter((row) => row.time && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!values.length) throw new ForexProviderError('Forex provider returned no valid candles.', 502, 'INVALID_CANDLES');
  const result = {
    symbol: pair.symbol,
    pair: pair.pair,
    interval,
    source: 'Twelve Data',
    updatedAt: new Date().toISOString(),
    timezone: payload.meta?.timezone || 'UTC',
    volumeType: null,
    candles: values
  };
  cacheSet(key, result, CANDLE_TTL_MS);
  return { ...result, cached: false };
};

export const clearForexCache = () => cache.clear();
export const forexCacheSettings = Object.freeze({ quoteTtlMs: QUOTE_TTL_MS, candleTtlMs: CANDLE_TTL_MS, quoteStaleAfterMs: QUOTE_STALE_AFTER_MS });
