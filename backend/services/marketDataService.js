import { generateIdeasForSymbol, IDEA_RULES, normalizeCompletedCandles } from './ideaGenerator.js';

export const COMMUNITY_IDEA_SYMBOLS = Object.freeze(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']);
export const BINANCE_REQUEST_TIMEOUT_MS = 8_000;
export const COMMUNITY_IDEAS_CACHE_MS = 45_000;
const KLINE_LIMIT = 100;
const MAX_CONCURRENT_KLINE_REQUESTS = 3;

let cachedIdeas = null;
let cachedIdeasExpiresAt = 0;
let ideasRequestInFlight = null;

const getBinanceBase = () => (process.env.BINANCE_API_BASE || 'https://api.binance.com').replace(/\/+$/, '');

export const fetchBinanceJson = async (endpoint, params = {}, fetchImpl = fetch) => {
  const url = new URL(`${getBinanceBase()}/api/v3/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(BINANCE_REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) {
    const error = new Error(`Binance request failed with status ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const runLimited = async (values, limit, callback) => {
  const results = new Array(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await callback(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
};

const fetchTickerRows = async () => {
  const symbols = JSON.stringify(COMMUNITY_IDEA_SYMBOLS);
  const rows = await fetchBinanceJson('ticker/24hr', { symbols });
  if (!Array.isArray(rows)) throw new Error('Binance returned an unexpected ticker response.');
  return rows;
};

const isUsableTicker = (ticker) => {
  const price = Number(ticker?.lastPrice);
  const change = Number(ticker?.priceChangePercent);
  const closeTime = Number(ticker?.closeTime);
  return Number.isFinite(price) && price > 0 && Number.isFinite(change) && Number.isFinite(closeTime);
};

const loadCommunityIdeas = async () => {
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const unavailableSymbols = [];
  const insufficientSymbols = [];
  const validTickerRows = new Map();

  let tickerRows;
  try {
    tickerRows = await fetchTickerRows();
  } catch (error) {
    // A single unavailable pair can make Binance reject a multi-symbol request.
    // Fall back to isolated ticker requests so healthy pairs still produce ideas.
    tickerRows = await runLimited(COMMUNITY_IDEA_SYMBOLS, MAX_CONCURRENT_KLINE_REQUESTS, async (symbol) => {
      try {
        const row = await fetchBinanceJson('ticker/24hr', { symbol });
        return { symbol, row };
      } catch (tickerError) {
        unavailableSymbols.push(symbol);
        return { symbol, error: tickerError };
      }
    });
    for (const entry of tickerRows) {
      if (entry?.row && isUsableTicker(entry.row)) validTickerRows.set(entry.symbol, entry.row);
    }
    if (validTickerRows.size === 0) throw error;
    tickerRows = null;
  }

  if (tickerRows) {
    for (const ticker of tickerRows) {
      if (COMMUNITY_IDEA_SYMBOLS.includes(ticker?.symbol) && isUsableTicker(ticker)) {
        validTickerRows.set(ticker.symbol, ticker);
      }
    }
    const missingTickers = COMMUNITY_IDEA_SYMBOLS.filter((symbol) => !validTickerRows.has(symbol));
    const individualTickers = await runLimited(missingTickers, MAX_CONCURRENT_KLINE_REQUESTS, async (symbol) => {
      try {
        const row = await fetchBinanceJson('ticker/24hr', { symbol });
        if (isUsableTicker(row)) validTickerRows.set(symbol, row);
        else unavailableSymbols.push(symbol);
      } catch {
        unavailableSymbols.push(symbol);
      }
    });
    void individualTickers;
  }

  const pairResults = await runLimited(COMMUNITY_IDEA_SYMBOLS, MAX_CONCURRENT_KLINE_REQUESTS, async (symbol) => {
    const ticker = validTickerRows.get(symbol);
    if (!ticker) return { symbol, status: 'unavailable', ideas: [] };
    try {
      const candleRows = await fetchBinanceJson('klines', {
        symbol,
        interval: IDEA_RULES.interval,
        limit: KLINE_LIMIT
      });
      const result = generateIdeasForSymbol({ symbol, ticker, candleRows, now, generatedAt });
      if (result.status === 'invalid-market-data') return { symbol, status: 'unavailable', ideas: [] };
      // Reuse the exact completed hourly candles used by the signal rules for card sparklines.
      const chartData = normalizeCompletedCandles(candleRows, now)
        .slice(-24)
        .map((candle) => ({
          time: new Date(candle.closeTime).toISOString(),
          value: candle.close
        }));
      return {
        symbol,
        status: result.status,
        ideas: result.ideas.map((idea) => ({ ...idea, chartData }))
      };
    } catch {
      return { symbol, status: 'unavailable', ideas: [] };
    }
  });

  const ideas = pairResults.flatMap((result) => result.ideas);
  const availableSymbols = pairResults.filter((result) => result.status !== 'unavailable').map((result) => result.symbol);
  const klineUnavailable = pairResults.filter((result) => result.status === 'unavailable').map((result) => result.symbol);
  const insufficient = pairResults
    .filter((result) => ['limited-history', 'insufficient-candles'].includes(result.status))
    .map((result) => result.symbol);
  const unavailable = [...new Set([...unavailableSymbols, ...klineUnavailable])];

  if (availableSymbols.length === 0) {
    const error = new Error('Market data is temporarily unavailable for the supported pairs.');
    error.status = 503;
    error.unavailableSymbols = unavailable;
    throw error;
  }

  return {
    success: true,
    data: ideas,
    meta: {
      source: 'Binance',
      interval: IDEA_RULES.interval,
      generatedAt,
      cached: false,
      availableSymbols,
      unavailableSymbols: unavailable,
      insufficientSymbols: insufficient,
      rules: IDEA_RULES
    }
  };
};

export const getCommunityMarketIdeas = async () => {
  const now = Date.now();
  if (cachedIdeas && now < cachedIdeasExpiresAt) {
    return { ...cachedIdeas, meta: { ...cachedIdeas.meta, cached: true } };
  }
  if (ideasRequestInFlight) return ideasRequestInFlight;

  ideasRequestInFlight = loadCommunityIdeas()
    .then((payload) => {
      cachedIdeas = payload;
      cachedIdeasExpiresAt = Date.now() + COMMUNITY_IDEAS_CACHE_MS;
      return payload;
    })
    .finally(() => {
      ideasRequestInFlight = null;
    });
  return ideasRequestInFlight;
};

export const clearCommunityIdeasCache = () => {
  cachedIdeas = null;
  cachedIdeasExpiresAt = 0;
  ideasRequestInFlight = null;
};

export const marketDataHelpers = Object.freeze({
  normalizeCompletedCandles
});
