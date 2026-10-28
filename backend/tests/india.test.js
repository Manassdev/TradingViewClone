import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import NamedWatchlist from '../models/NamedWatchlist.js';
import Notification from '../models/Notification.js';
import { getIndiaInstrument, getIndiaInstruments, normalizeIndiaSymbol, searchIndiaInstruments } from '../services/indiaRegistry.js';
import { clearIndiaCache, getIndiaCandles, getIndiaQuote, getIndiaQuotes, getIndiaMarketStatus, IndiaProviderError, parseIndiaTimestamp } from '../services/indiaDataService.js';

const withEnv = async (name, value, run) => {
  const original = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  try { await run(); }
  finally { if (original === undefined) delete process.env[name]; else process.env[name] = original; }
};

test('registry normalizes and distinguishes exchange listings and Indian indices', () => {
  assert.equal(normalizeIndiaSymbol(' reliance '), 'RELIANCE');
  assert.equal(getIndiaInstrument('NSE', 'RELIANCE').providerSymbol, 'RELIANCE');
  assert.equal(getIndiaInstrument('BSE', 'RELIANCE').exchange, 'BSE');
  assert.equal(getIndiaInstrument('NASDAQ', 'RELIANCE'), null);
  for (const symbol of ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'LT', 'BHARTIARTL', 'TATAMOTORS']) {
    assert.ok(getIndiaInstrument('NSE', symbol));
    assert.ok(getIndiaInstrument('BSE', symbol));
  }
  for (const symbol of ['NIFTY', 'BANKNIFTY', 'FINNIFTY']) assert.equal(getIndiaInstrument('NSE', symbol).assetType, 'india_index');
  assert.equal(getIndiaInstrument('BSE', 'SENSEX').assetType, 'india_index');
  assert.ok(searchIndiaInstruments('National').length === 0);
  assert.ok(searchIndiaInstruments('NIFTY').length >= 2);
  assert.equal(getIndiaInstruments({ exchange: 'NSE' }).every((item) => item.exchange === 'NSE'), true);
});

test('India local exchange timestamps are normalized to UTC and offset timestamps remain stable', () => {
  assert.equal(parseIndiaTimestamp('2026-10-28 09:15:00'), '2026-10-28T03:45:00.000Z');
  assert.equal(parseIndiaTimestamp('2026-10-28T09:15:00+05:30'), '2026-10-28T03:45:00.000Z');
  assert.equal(parseIndiaTimestamp('not-a-date'), null);
});

test('quote adapter sends exact exchange and provider symbol, normalizes fields, then caches', async () => {
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearIndiaCache();
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url) => {
      calls += 1;
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('symbol'), 'RELIANCE');
      assert.equal(parsed.searchParams.get('exchange'), 'NSE');
      return new Response(JSON.stringify({ meta: { symbol: 'RELIANCE', exchange: 'NSE' }, price: '1250.5', change: '10.5', percent_change: '0.85', open: '1240', high: '1260', low: '1235', previous_close: '1240', volume: '123456', timestamp: String(Date.now()) }), { status: 200 });
    };
    try {
      const first = await getIndiaQuote('NSE', 'RELIANCE');
      const cached = await getIndiaQuote('nse', 'reliance');
      assert.equal(first.price, 1250.5);
      assert.equal(first.changePercent, .85);
      assert.equal(first.volume, 123456);
      assert.equal(first.currency, 'INR');
      assert.equal(first.dataDelay, 'End-of-day (EOD)');
      assert.equal(first.cached, false);
      assert.equal(cached.cached, true);
      assert.equal(calls, 1);
    } finally { globalThis.fetch = originalFetch; clearIndiaCache(); }
  });
});

test('candles normalize Indian timestamps and only preserve provider-supplied volume', async () => {
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearIndiaCache();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ meta: { symbol: 'TCS', exchange: 'NSE', exchange_timezone: 'Asia/Kolkata' }, values: [
      { datetime: '2026-10-27 15:30:00', open: '4000', high: '4050', low: '3990', close: '4040', volume: '100' },
      { datetime: '2026-10-28 15:30:00', open: '4040', high: '4070', low: '4020', close: '4060' }
    ] }), { status: 200 });
    try {
      const result = await getIndiaCandles('NSE', 'TCS', '1D', 10);
      assert.equal(result.candles.length, 2);
      assert.equal(result.candles[0].time, '2026-10-27T10:00:00.000Z');
      assert.equal(result.candles[0].volume, 100);
      assert.equal(result.candles[1].volume, null);
      assert.equal(result.timezone, 'Asia/Kolkata');
      await assert.rejects(getIndiaCandles('NSE', 'TCS', '15m', 10), (error) => error.code === 'UNSUPPORTED_INTERVAL');
    } finally { globalThis.fetch = originalFetch; clearIndiaCache(); }
  });
});

test('missing keys, exchange mismatch, unsupported registry symbols, and rate limits are explicit', async () => {
  await withEnv('TWELVE_DATA_API_KEY', undefined, async () => {
    clearIndiaCache();
    await assert.rejects(getIndiaQuote('NSE', 'RELIANCE'), (error) => error instanceof IndiaProviderError && error.code === 'MISSING_API_KEY');
  });
  await assert.rejects(getIndiaQuote('BSE', 'NOPE'), (error) => error.code === 'UNSUPPORTED_INSTRUMENT');
  await withEnv('TWELVE_DATA_API_KEY', 'test-key', async () => {
    clearIndiaCache();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ meta: { symbol: 'RELIANCE', exchange: 'BSE' }, price: '10', timestamp: String(Date.now()) }), { status: 200 });
    try { await assert.rejects(getIndiaQuote('NSE', 'RELIANCE'), (error) => error.code === 'PROVIDER_EXCHANGE_MISMATCH'); }
    finally { globalThis.fetch = originalFetch; clearIndiaCache(); }
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 429, message: 'rate limit' }), { status: 429 });
    try { await assert.rejects(getIndiaQuote('NSE', 'RELIANCE'), (error) => error.status === 429 && error.code === 'PROVIDER_RATE_LIMIT'); }
    finally { globalThis.fetch = originalFetch; clearIndiaCache(); }
  });
});

test('India exchange calendar uses Asia/Kolkata, regular hours, and requires current-year holidays', async () => {
  await withEnv('INDIA_MARKET_HOLIDAYS', undefined, async () => {
    const weekdayOpen = getIndiaMarketStatus('NSE', new Date('2026-10-28T04:00:00Z'));
    assert.equal(weekdayOpen.timezone, 'Asia/Kolkata');
    assert.equal(weekdayOpen.state, 'unknown');
    const weekend = getIndiaMarketStatus('BSE', new Date('2026-10-31T04:00:00Z'));
    assert.equal(weekend.state, 'closed');
  });
  await withEnv('INDIA_MARKET_HOLIDAYS', '2026-01-26,2026-10-28', async () => {
    assert.equal(getIndiaMarketStatus('NSE', new Date('2026-10-28T04:00:00Z')).state, 'closed');
    assert.equal(getIndiaMarketStatus('NSE', new Date('2026-10-27T04:00:00Z')).state, 'open');
    assert.equal(getIndiaMarketStatus('NSE', new Date('2026-10-27T03:40:00Z')).state, 'pre-open');
    assert.equal(getIndiaMarketStatus('NSE', new Date('2026-10-27T10:10:00Z')).state, 'post-market');
  });
});

test('existing Mongo schemas accept India stocks, indices, exchange identity, and notifications', () => {
  const userId = new mongoose.Types.ObjectId();
  const watchlist = new NamedWatchlist({ owner: userId, name: 'India', items: [
    { symbol: 'RELIANCE', assetType: 'india_stock', exchange: 'NSE', provider: 'twelvedata', providerSymbol: 'RELIANCE' },
    { symbol: 'RELIANCE', assetType: 'india_stock', exchange: 'BSE', provider: 'twelvedata', providerSymbol: 'RELIANCE' },
    { symbol: 'NIFTY', assetType: 'india_index', exchange: 'NSE', provider: 'twelvedata', providerSymbol: 'NIFTY' }
  ] });
  assert.equal(watchlist.validateSync(), undefined);
  const alert = new Alert({ userId, symbol: 'RELIANCE', assetType: 'india_stock', exchange: 'NSE', provider: 'twelvedata', providerSymbol: 'RELIANCE', triggerCondition: 'crosses_up', targetValue: 1300 });
  assert.equal(alert.validateSync(), undefined);
  const notification = new Notification({ userId, alertId: new mongoose.Types.ObjectId(), symbol: 'RELIANCE', exchange: 'NSE', assetType: 'india_stock', price: 1300, title: 'Reached', message: 'NSE:RELIANCE', type: 'price_alert' });
  assert.equal(notification.validateSync(), undefined);
});
