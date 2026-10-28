import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

import { IDEA_RULES, generateIdeasForSymbol, normalizeCompletedCandles } from '../services/ideaGenerator.js';
import {
  COMMUNITY_IDEA_SYMBOLS,
  clearCommunityIdeasCache,
  getCommunityMarketIdeas
} from '../services/marketDataService.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedAt = '2026-01-10T12:00:00.000Z';
const priceTimestamp = '2026-01-10T11:59:59.000Z';

const makeIdea = (symbol, kind, signal, index) => ({
  id: `binance-${symbol}-${kind}`,
  symbol,
  title: `${symbol} analysis`,
  signal,
  kind,
  price: 100 + index,
  change24h: signal === 'bullish' ? 1.2 : -1.1,
  description: `Backend reason for ${kind}.`,
  indicator: kind,
  generatedAt,
  priceTimestamp,
  candleTimestamp: priceTimestamp,
  interval: '1h',
  source: 'Binance',
  chartData: [
    { time: '2026-01-10T09:00:00.000Z', value: 98 + index },
    { time: '2026-01-10T10:00:00.000Z', value: 100 + index },
    { time: '2026-01-10T11:00:00.000Z', value: 99 + index }
  ]
});

const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

const makeFrontendHarness = async (fetchImpl, { waitForLoad = true } = {}) => {
  const filterValues = ['all', 'bullish', 'bearish', 'breakout', 'moving_average'];
  const filters = filterValues.map((value) => {
    const button = new FakeElement('button');
    button.dataset.ideaFilter = value;
    return button;
  });
  const grid = new FakeElement('div');
  const status = new FakeElement('p');
  const intervals = [];
  const elements = new Map([['community-ideas-grid', grid], ['community-ideas-status', status]]);
  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (selector) => selector === '[data-idea-filter]' ? filters : [],
    createElement: (tag) => new FakeElement(tag),
    createElementNS: (_namespace, tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text),
    addEventListener() {}
  };
  const window = {
    ApiClient: { API_BASE: 'http://localhost:5000/api' },
    setInterval(callback) { intervals.push(callback); return 1; }
  };
  const context = { window, document, fetch: fetchImpl, URL, Intl, Date, Number, Object, String, Array, Map, Set };
  const script = await readFile(join(root, '..', 'js', 'communityIdeas.js'), 'utf8');
  vm.runInNewContext(script, context, { filename: 'communityIdeas.js' });
  const pending = window.refreshCommunityIdeas();
  if (waitForLoad) await pending;
  return { document, filters, grid, intervals, pending, status, window };
};

test('technical-analysis signals expose explicit kinds and use completed hourly candles', () => {
  const now = Date.parse(generatedAt);
  const candleRows = Array.from({ length: IDEA_RULES.minimumSmaCandles }, (_, index) => {
    const openTime = now - ((IDEA_RULES.minimumSmaCandles - index) * 60 * 60 * 1000);
    const last = index === IDEA_RULES.minimumSmaCandles - 1;
    const close = last ? 102 : 100;
    return [openTime, 100, last ? 103 : 101, last ? 100 : 99, close, 1000, openTime + 3_599_999];
  });
  const openCandle = [now, 102, 110, 101, 109, 500, now + 3_599_999];
  const ticker = { lastPrice: '102', priceChangePercent: '1.25', closeTime: now - 1 };
  const result = generateIdeasForSymbol({ symbol: 'BTCUSDT', ticker, candleRows: [...candleRows, openCandle], now });

  assert.deepEqual(normalizeCompletedCandles([...candleRows, openCandle], now).map((candle) => candle.close), candleRows.map((row) => row[4]));
  assert.ok(result.ideas.some((idea) => idea.kind === 'resistance-breakout'));
  assert.ok(result.ideas.some((idea) => idea.kind === 'sma-bullish-crossover'));
  assert.ok(result.ideas.every((idea) => idea.interval === '1h'));
  assert.ok(result.ideas.every((idea) => idea.generatedAt === generatedAt));
});

test('a 9/21 moving-average trend keeps market ideas populated when no event trigger occurs', () => {
  const now = Date.parse(generatedAt);
  const candleRows = Array.from({ length: 24 }, (_, index) => {
    const openTime = now - ((24 - index) * 60 * 60 * 1000);
    const close = 100 + index;
    return [openTime, close, close + 1, close - 1, close, 1000, openTime + 3_599_999];
  });
  const result = generateIdeasForSymbol({
    symbol: 'BTCUSDT',
    ticker: { lastPrice: '124', priceChangePercent: '1.25', closeTime: now - 1 },
    candleRows,
    now
  });

  assert.equal(result.ideas.length, 1);
  assert.equal(result.ideas[0].kind, 'sma-bullish-trend');
  assert.match(result.ideas[0].description, /latest completed 1-hour 9-period SMA is above the 21-period SMA/);
});

test('market ideas attach real completed Binance closes for sparkline previews', async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.BINANCE_API_BASE;
  const now = Date.now();
  const calls = [];

  const rowsFor = (symbol) => {
    const rows = Array.from({ length: 100 }, (_, index) => {
      const openTime = now - ((100 - index) * 60 * 60 * 1000);
      const final = index === 99 && symbol === 'BTCUSDT';
      const close = final ? 102 : 100;
      return [openTime, 100, final ? 103 : 101, final ? 100 : 99, close, 1000, openTime + 3_599_999];
    });
    rows.push([now, 102, 110, 101, 109, 500, now + 3_599_999]);
    return rows;
  };

  try {
    process.env.BINANCE_API_BASE = 'https://binance-fixture.invalid';
    globalThis.fetch = async (input) => {
      const url = new URL(input);
      calls.push(url);
      if (url.pathname.endsWith('/ticker/24hr')) {
        return {
          ok: true,
          json: async () => COMMUNITY_IDEA_SYMBOLS.map((symbol) => ({
            symbol,
            lastPrice: symbol === 'BTCUSDT' ? '102' : '100',
            priceChangePercent: '0.25',
            closeTime: now - 1
          }))
        };
      }
      if (url.pathname.endsWith('/klines')) {
        return { ok: true, json: async () => rowsFor(url.searchParams.get('symbol')) };
      }
      throw new Error(`Unexpected Binance fixture request: ${url.pathname}`);
    };

    clearCommunityIdeasCache();
    const payload = await getCommunityMarketIdeas();
    assert.equal(calls.length, COMMUNITY_IDEA_SYMBOLS.length + 1);
    assert.ok(payload.data.length > 0);
    for (const idea of payload.data) {
      assert.equal(idea.kind.endsWith('breakout') || idea.kind.startsWith('sma-'), true);
      assert.equal(idea.chartData.length, 24);
      assert.equal(idea.chartData.at(-1).value, idea.symbol === 'BTCUSDT' ? 102 : 100);
      assert.ok(idea.chartData.every((point) => Number.isFinite(Date.parse(point.time)) && Number.isFinite(point.value)));
      assert.ok(idea.chartData.every((point) => Date.parse(point.time) < Date.parse(payload.meta.generatedAt)));
    }
  } finally {
    clearCommunityIdeasCache();
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.BINANCE_API_BASE;
    else process.env.BINANCE_API_BASE = originalBase;
  }
});

test('Community Ideas cards display backend values and each filter follows returned signal kinds', async () => {
  const ideas = [
    makeIdea('BTCUSDT', 'sma-bullish-crossover', 'bullish', 0),
    makeIdea('ETHUSDT', 'sma-bearish-crossover', 'bearish', 1),
    makeIdea('BNBUSDT', 'resistance-breakout', 'bullish', 2),
    makeIdea('SOLUSDT', 'support-breakdown', 'bearish', 3)
  ];
  let fetchCalls = 0;
  const harness = await makeFrontendHarness(async (url) => {
    fetchCalls += 1;
    assert.match(url, /\/market\/ideas$/);
    return response({
      success: true,
      data: ideas,
      meta: { generatedAt, cached: false, unavailableSymbols: [], insufficientSymbols: [] }
    });
  });

  assert.equal(harness.grid.children.length, 4);
  const firstCard = harness.grid.children[0];
  assert.match(firstCard.className, /dynamic-idea-card/);
  assert.match(firstCard.textContent, /BTC/);
  assert.match(firstCard.textContent, /BTC \/ USDT · Binance/);
  assert.match(firstCard.textContent, /100 USDT/);
  assert.match(firstCard.textContent, /1h/);
  assert.match(firstCard.textContent, /Backend reason for sma-bullish-crossover/);
  assert.match(firstCard.textContent, /Generated/);
  assert.match(firstCard.textContent, /Price updated/);
  const sparkline = findByTag(firstCard, 'POLYLINE');
  assert.ok(sparkline, 'card includes an SVG price sparkline');
  assert.match(sparkline.getAttribute('points'), /8\.00,84\.00/);
  assert.match(sparkline.getAttribute('points'), /312\.00,46\.00/);
  const viewLink = findByClass(firstCard, 'idea-view-analysis');
  assert.equal(viewLink.href, 'idea.html?id=binance-BTCUSDT-sma-bullish-crossover');
  assert.match(viewLink.textContent, /View Analysis/);

  harness.filters.find((button) => button.dataset.ideaFilter === 'bullish').click();
  assert.equal(harness.grid.children.length, 2);
  assert.ok(harness.grid.children.every((card) => card.textContent.includes('Bullish')));
  harness.filters.find((button) => button.dataset.ideaFilter === 'bearish').click();
  assert.equal(harness.grid.children.length, 2);
  assert.ok(harness.grid.children.every((card) => card.textContent.includes('Bearish')));
  harness.filters.find((button) => button.dataset.ideaFilter === 'breakout').click();
  assert.equal(harness.grid.children.length, 2);
  assert.ok(harness.grid.children.every((card) => /breakdown|breakout/i.test(card.textContent)));
  harness.filters.find((button) => button.dataset.ideaFilter === 'moving_average').click();
  assert.equal(harness.grid.children.length, 2);
  assert.ok(harness.grid.children.every((card) => /crossover/i.test(card.textContent)));
  harness.filters.find((button) => button.dataset.ideaFilter === 'all').click();
  assert.equal(harness.grid.children.length, 4);
  assert.equal(fetchCalls, 1, 'filtering uses the returned ideas without extra backend calls');
});

test('empty, loading, and error states include working refresh actions and never create ideas', async () => {
  let resolveFirst;
  let calls = 0;
  const pendingResponse = new Promise((resolve) => { resolveFirst = resolve; });
  const harness = await makeFrontendHarness(async () => {
    calls += 1;
    if (calls === 1) return pendingResponse;
    return response({ success: true, data: [], meta: { generatedAt, cached: false } });
  }, { waitForLoad: false });
  assert.equal(harness.status.dataset.state, 'loading');
  assert.equal(harness.grid.children[0].dataset.state, 'loading');

  resolveFirst(response({ success: true, data: [], meta: { generatedAt, cached: false } }));
  await harness.pending;
  assert.equal(harness.grid.children.length, 1);
  assert.equal(harness.grid.children[0].dataset.state, 'empty');
  assert.match(harness.grid.textContent, /No signals right now/);
  assert.equal(findByClass(harness.grid, 'idea-refresh-button').textContent, 'Refresh Ideas');
  findByClass(harness.grid, 'idea-refresh-button').click();
  await harness.window.refreshCommunityIdeas();
  assert.equal(calls, 2);
  assert.equal(harness.grid.children[0].dataset.state, 'empty');

  const failed = await makeFrontendHarness(async () => response({
    success: false,
    message: 'Market data is temporarily unavailable.'
  }, 503));
  assert.equal(failed.status.dataset.state, 'error');
  assert.equal(failed.grid.children[0].dataset.state, 'error');
  findByClass(failed.grid, 'idea-refresh-button').click();
  await failed.window.refreshCommunityIdeas();
});

test('idea card grid retains three, two, and one column responsive breakpoints', async () => {
  const css = await readFile(join(root, '..', 'css', 'overview.css'), 'utf8');
  assert.match(css, /\.ideas-section \.ideas-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*900px\)\s*\{\s*\.ideas-section \.ideas-grid\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.ideas-section \.ideas-grid\s*\{\s*grid-template-columns:\s*1fr/s);
});

class FakeText {
  constructor(text) { this.textContent = String(text); }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this._textContent = '';
    this.parentNode = null;
    this.classList = {
      add: (...names) => {
        const existing = new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach((name) => existing.add(name));
        this.className = [...existing].join(' ');
      },
      toggle: (name, force) => {
        const existing = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) existing.add(name);
        else existing.delete(name);
        this.className = [...existing].join(' ');
      }
    };
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent || '').join('');
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
    });
  }

  appendChild(child) { this.append(child); return child; }

  replaceChildren(...children) {
    this.children = [];
    this._textContent = '';
    this.append(...children);
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  click() { (this.listeners.get('click') || []).forEach((callback) => callback({ target: this })); }
}

const findByTag = (root, tagName) => {
  if (root.tagName === tagName) return root;
  for (const child of root.children || []) {
    const found = findByTag(child, tagName);
    if (found) return found;
  }
  return null;
};

const findByClass = (root, className) => {
  if ((root.className || '').split(/\s+/).includes(className)) return root;
  for (const child of root.children || []) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
};
