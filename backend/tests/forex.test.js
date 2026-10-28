import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { getForexPair, getForexPairs, normalizeForexSymbol } from '../services/forexRegistry.js';
import { clearForexCache, getForexCandles, getForexQuote, getForexQuotes, ForexProviderError } from '../services/forexDataService.js';
import NamedWatchlist from '../models/NamedWatchlist.js';

const withEnv = async (key, value, run) => {
  const original = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { await run(); }
  finally { if (original === undefined) delete process.env[key]; else process.env[key] = original; }
};

test('normalizes provider-style symbols and registers required majors and minors', () => {
  assert.equal(normalizeForexSymbol(' eur/usd '), 'EURUSD');
  assert.equal(normalizeForexSymbol('EURUSD=X'), 'EURUSD');
  assert.equal(getForexPair('GBP/JPY').symbol, 'GBPJPY');
  assert.equal(getForexPair('not-a-pair'), null);
  const pairs = getForexPairs();
  for (const symbol of ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'EURAUD', 'GBPCHF', 'AUDJPY', 'EURCHF', 'CADJPY']) {
    assert.ok(pairs.some((pair) => pair.symbol === symbol), `${symbol} should be registered`);
  }
});

test('loads and normalizes a provider quote, then serves it from cache', async () => {
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearForexCache();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      assert.match(String(url), /symbol=EUR%2FUSD/);
      return new Response(JSON.stringify({ symbol: 'EUR/USD', close: '1.08456', change: '0.002', percent_change: '0.18', datetime: '2026-10-28 12:30:00', is_market_open: true, bid: '1.0845', ask: '1.0846' }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    try {
      const first = await getForexQuote('EUR/USD');
      const second = await getForexQuote('EURUSD');
      assert.equal(first.rate, 1.08456);
      assert.equal(first.changePercent, 0.18);
      assert.equal(first.bid, 1.0845);
      assert.equal(first.sessionStatus, 'open');
      assert.equal(first.cached, false);
      assert.equal(second.cached, true);
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; clearForexCache(); }
  });
});

test('normalizes provider OHLC history without inventing volume', async () => {
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearForexCache();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({ meta: { timezone: 'UTC' }, values: [
        { datetime: '2026-10-28 10:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.15' },
        { datetime: '2026-10-28 09:00:00', open: '1.0', high: '1.1', low: '0.9', close: '1.05' }
      ] }), { status: 200 });
    };
    try {
      const result = await getForexCandles('EURUSD', '1h', 10);
      const cached = await getForexCandles('EURUSD', '1h', 10);
      assert.equal(result.candles.length, 2);
      assert.ok(Date.parse(result.candles[0].time) < Date.parse(result.candles[1].time));
      assert.equal(result.candles[1].close, 1.15);
      assert.equal(result.volumeType, null);
      assert.equal('volume' in result.candles[0], false);
      assert.equal(cached.cached, true);
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; clearForexCache(); }
  });
});

test('watchlist schema accepts Forex while keeping existing asset types valid', () => {
  const owner = new mongoose.Types.ObjectId();
  const list = new NamedWatchlist({ owner, name: 'Markets', items: [
    { symbol: 'EURUSD', assetType: 'forex', exchange: 'FX' },
    { symbol: 'BTCUSDT', assetType: 'crypto', exchange: 'BINANCE' },
    { symbol: 'AAPL', assetType: 'stock', exchange: 'NASDAQ' }
  ] });
  assert.equal(list.validateSync(), undefined);
});

test('reports missing credentials and unsupported pairs without a provider request', async () => {
  await withEnv('TWELVE_DATA_API_KEY', undefined, async () => {
    clearForexCache();
    await assert.rejects(getForexQuote('EURUSD'), (error) => error instanceof ForexProviderError && error.code === 'MISSING_API_KEY');
  });
  await assert.rejects(getForexQuote('EURXXX'), (error) => error instanceof ForexProviderError && error.code === 'UNSUPPORTED_PAIR');
});

test('normalizes provider rate limits and per-symbol errors', async () => {
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearForexCache();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => String(url).includes('GBP%2FUSD')
      ? new Response(JSON.stringify({ code: 429, message: 'limit' }), { status: 429 })
      : new Response(JSON.stringify({ symbol: 'EUR/USD', close: '1.08', percent_change: '0.1', datetime: '2026-10-28 12:30:00', is_market_open: true }), { status: 200 });
    try {
      await assert.rejects(getForexQuote('GBPUSD'), (error) => error.status === 429 && error.code === 'PROVIDER_RATE_LIMIT');
      clearForexCache();
      const result = await getForexQuotes(['GBPUSD', 'EURUSD']);
      assert.equal(result.data.length, 1);
      assert.equal(result.errors[0].symbol, 'GBPUSD');
      assert.equal(result.errors[0].status, 429);
    } finally { globalThis.fetch = originalFetch; clearForexCache(); }
  });
});
