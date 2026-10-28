import { getIndiaInstrument } from './indiaRegistry.js';

const API_BASE = 'https://api.twelvedata.com';
const QUOTE_TTL_MS = 15 * 60_000;
const CANDLE_TTL_MS = 60 * 60_000;
const QUOTE_STALE_AFTER_MS = 5 * 24 * 60 * 60_000;
const cache = new Map();
const numberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export class IndiaProviderError extends Error {
  constructor(message, status = 503, code = 'INDIA_PROVIDER_ERROR') {
    super(message);
    this.name = 'IndiaProviderError';
    this.status = status;
    this.code = code;
  }
}

// Twelve Data equity timestamps are local exchange time. India has no DST;
// convert naive provider timestamps to UTC explicitly rather than using the host timezone.
export const parseIndiaTimestamp = (value) => {
  if (typeof value === 'string' && /^\d{10,13}$/.test(value.trim())) value = Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = value.trim();
  if (/[zZ]|[+-]\d\d(?::?\d\d)?$/.test(source)) {
    const date = new Date(source);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const match = /^(\d{4})-(\d\d)-(\d\d)[ T](\d\d):(\d\d)(?::(\d\d))?$/.exec(source);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0'] = match;
  const epoch = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)) - (5 * 60 + 30) * 60_000;
  return new Date(epoch).toISOString();
};

const getApiKey = () => {
  const key = process.env.TWELVE_DATA_API_KEY?.trim();
  if (!key) throw new IndiaProviderError('Indian market data is not configured. Set TWELVE_DATA_API_KEY in backend/.env.', 503, 'MISSING_API_KEY');
  return key;
};

const requestProvider = async (path, params) => {
  const url = new URL(path, API_BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
  url.searchParams.set('apikey', getApiKey());
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: 'application/json' } });
  } catch {
    throw new IndiaProviderError('Indian market data provider timed out or could not connect.', 504, 'PROVIDER_TIMEOUT');
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new IndiaProviderError('Indian market data provider returned unreadable data.', 502, 'INVALID_PROVIDER_RESPONSE'); }
  if (response.status === 429 || Number(payload?.code) === 429) {
    throw new IndiaProviderError('Twelve Data rate limit reached. Wait before refreshing Indian market data.', 429, 'PROVIDER_RATE_LIMIT');
  }
  if (response.status === 401 || response.status === 403 || [401, 403].includes(Number(payload?.code))) {
    throw new IndiaProviderError('Twelve Data rejected the key or Indian exchange entitlement. India EOD access requires an eligible plan.', 503, 'PROVIDER_ENTITLEMENT');
  }
  if (!response.ok || payload?.status === 'error' || payload?.code) {
    throw new IndiaProviderError('Twelve Data could not return this exact symbol on the selected exchange.', 502, 'UNSUPPORTED_PROVIDER_SYMBOL');
  }
  return payload;
};

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { cache.delete(key); return null; }
  return entry.value;
};
const cacheSet = (key, value, ttl) => {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  if (cache.size > 1_000) for (const [keyToCheck, entry] of cache) if (entry.expiresAt <= Date.now()) cache.delete(keyToCheck);
};

const exchangeMatches = (providerExchange, requested) => {
  if (!providerExchange) return true;
  const value = String(providerExchange).toLowerCase();
  if (requested === 'NSE') return ['nse', 'xnse', 'national stock exchange of india'].includes(value);
  if (requested === 'BSE') return ['bse', 'xbom', 'bombay stock exchange', 'bse limited'].includes(value);
  return false;
};
const assertInstrumentResponse = (instrument, payload) => {
  const providerSymbol = payload?.meta?.symbol || payload?.symbol;
  if (providerSymbol && String(providerSymbol).toUpperCase() !== instrument.providerSymbol.toUpperCase()) {
    throw new IndiaProviderError('Provider response symbol did not match the requested instrument.', 502, 'PROVIDER_SYMBOL_MISMATCH');
  }
  const providerExchange = payload?.meta?.exchange || payload?.exchange;
  if (!exchangeMatches(providerExchange, instrument.exchange)) {
    throw new IndiaProviderError('Provider response exchange did not match the requested exchange.', 502, 'PROVIDER_EXCHANGE_MISMATCH');
  }
};

const normalizeQuote = (instrument, payload) => {
  assertInstrumentResponse(instrument, payload);
  const price = numberOrNull(payload.close ?? payload.price);
  const updatedAt = parseIndiaTimestamp(payload.datetime || payload.timestamp || payload.last_updated);
  if (!(price > 0) || !updatedAt) throw new IndiaProviderError('Provider returned an incomplete Indian market quote.', 502, 'INVALID_QUOTE');
  const ageMs = Date.now() - Date.parse(updatedAt);
  return {
    ...instrument,
    price,
    change: numberOrNull(payload.change),
    changePercent: numberOrNull(payload.percent_change),
    open: numberOrNull(payload.open),
    high: numberOrNull(payload.high),
    low: numberOrNull(payload.low),
    previousClose: numberOrNull(payload.previous_close),
    volume: numberOrNull(payload.volume),
    provider: 'Twelve Data',
    dataDelay: 'End-of-day (EOD)',
    updatedAt,
    isStale: ageMs < 0 || ageMs > QUOTE_STALE_AFTER_MS,
    marketStatus: getIndiaMarketStatus(instrument.exchange)
  };
};

export const getIndiaQuote = async (exchange, symbol) => {
  const instrument = getIndiaInstrument(exchange, symbol);
  if (!instrument) throw new IndiaProviderError('This symbol is not in the Indian instrument registry for that exchange.', 404, 'UNSUPPORTED_INSTRUMENT');
  const key = `quote:${instrument.exchange}:${instrument.symbol}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const payload = await requestProvider('/quote', {
    symbol: instrument.providerSymbol,
    exchange: instrument.exchange,
    timezone: 'Asia/Kolkata'
  });
  const quote = normalizeQuote(instrument, payload);
  cacheSet(key, quote, QUOTE_TTL_MS);
  return { ...quote, cached: false };
};

export const getIndiaQuotes = async (instruments) => {
  const rows = new Array(instruments.length);
  let next = 0;
  const worker = async () => {
    while (next < instruments.length) {
      const index = next++;
      const instrument = instruments[index];
      try { rows[index] = { quote: await getIndiaQuote(instrument.exchange, instrument.symbol) }; }
      catch (error) { rows[index] = { error: { exchange: instrument.exchange, symbol: instrument.symbol, message: error.message, code: error.code || 'INDIA_PROVIDER_ERROR', status: error.status || 502 } }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, instruments.length) }, worker));
  const data = rows.flatMap((row) => row.quote ? [row.quote] : []);
  const errors = rows.flatMap((row) => row.error ? [row.error] : []);
  if (!data.length && errors.length) {
    const error = new IndiaProviderError(errors[0].message, errors[0].status, errors[0].code);
    error.unavailableSymbols = errors.map(({ exchange, symbol }) => `${exchange}:${symbol}`);
    throw error;
  }
  return { data, errors };
};

export const getIndiaCandles = async (exchange, symbol, interval = '1D', outputsize = 180) => {
  const instrument = getIndiaInstrument(exchange, symbol);
  if (!instrument) throw new IndiaProviderError('This symbol is not in the Indian instrument registry for that exchange.', 404, 'UNSUPPORTED_INSTRUMENT');
  const intervals = { '1D': '1day', '1W': '1week', '1M': '1month' };
  const providerInterval = intervals[interval];
  if (!providerInterval) throw new IndiaProviderError('India EOD data supports 1D, 1W, and 1M intervals only.', 400, 'UNSUPPORTED_INTERVAL');
  if (!Number.isInteger(outputsize) || outputsize < 10 || outputsize > 500) throw new IndiaProviderError('Candle limit must be an integer from 10 to 500.', 400, 'INVALID_LIMIT');
  const key = `candles:${instrument.exchange}:${instrument.symbol}:${providerInterval}:${outputsize}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };
  const payload = await requestProvider('/time_series', {
    symbol: instrument.providerSymbol,
    exchange: instrument.exchange,
    interval: providerInterval,
    outputsize,
    timezone: 'Asia/Kolkata',
    order: 'ASC'
  });
  assertInstrumentResponse(instrument, payload);
  if (!Array.isArray(payload.values)) throw new IndiaProviderError('Provider returned no Indian candle history.', 502, 'INVALID_CANDLES');
  const candles = payload.values.map((row) => ({
    time: parseIndiaTimestamp(row.datetime),
    open: numberOrNull(row.open),
    high: numberOrNull(row.high),
    low: numberOrNull(row.low),
    close: numberOrNull(row.close),
    volume: numberOrNull(row.volume)
  })).filter((row) => row.time && row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0)
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  if (!candles.length) throw new IndiaProviderError('Provider returned no valid Indian candles.', 502, 'INVALID_CANDLES');
  const result = {
    instrument,
    interval,
    source: 'Twelve Data',
    dataDelay: 'End-of-day (EOD)',
    timezone: 'Asia/Kolkata',
    updatedAt: new Date().toISOString(),
    candles
  };
  cacheSet(key, result, CANDLE_TTL_MS);
  return { ...result, cached: false };
};

export const getIndiaMarketStatus = (exchange = 'NSE', now = new Date()) => {
  const normalizedExchange = String(exchange || '').trim().toUpperCase();
  if (!['NSE', 'BSE'].includes(normalizedExchange)) return { exchange: normalizedExchange || 'UNKNOWN', state: 'unknown', timezone: 'Asia/Kolkata' };
  const localParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const date = `${localParts.year}-${localParts.month}-${localParts.day}`;
  const dayOfWeek = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(now);
  const holidayDates = new Set(String(process.env.INDIA_MARKET_HOLIDAYS || '').split(',').map((day) => day.trim()).filter(Boolean));
  const hasCurrentYearCalendar = [...holidayDates].some((day) => day.startsWith(`${localParts.year}-`));
  const minute = Number(localParts.hour) * 60 + Number(localParts.minute);
  const weekday = !['Sat', 'Sun'].includes(dayOfWeek);
  let state = 'closed';
  if (weekday && !hasCurrentYearCalendar) state = 'unknown';
  else if (weekday && !holidayDates.has(date)) {
    if (minute >= 9 * 60 && minute < 9 * 60 + 15) state = 'pre-open';
    else if (minute >= 9 * 60 + 15 && minute < 15 * 60 + 30) state = 'open';
    else if (minute >= 15 * 60 + 30 && minute < 16 * 60) state = 'post-market';
  }
  return {
    exchange: normalizedExchange,
    state,
    timezone: 'Asia/Kolkata',
    date,
    regularHours: '09:15–15:30 IST, Monday–Friday except configured holidays',
    calendarCoverageYear: hasCurrentYearCalendar ? Number(localParts.year) : null,
    calendarSource: 'Weekday schedule plus operator-maintained INDIA_MARKET_HOLIDAYS dates; a current-year official holiday list is required to classify weekdays. Special sessions are not inferred.'
  };
};

export const clearIndiaCache = () => cache.clear();
export const indiaCacheSettings = Object.freeze({ quoteTtlMs: QUOTE_TTL_MS, candleTtlMs: CANDLE_TTL_MS, quoteStaleAfterMs: QUOTE_STALE_AFTER_MS });
