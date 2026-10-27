import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';

import { createNewsService, NEWS_CATEGORIES, NewsServiceError } from '../services/newsService.js';
import { createNewsRouter } from '../routes/newsRoutes.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sample = (id, title, publishedAt, url, category, extras = {}) => ({
  id,
  title,
  description: `<b>${title} summary</b>`,
  url,
  image: 'https://images.example.test/article.jpg',
  publishedAt,
  source: { name: `${category} publisher` },
  ...extras
});

const makeService = (fetchImpl, key = 'unit-test-key', onSleep = () => {}) => {
  let currentTime = Date.parse('2026-01-10T12:00:00.000Z');
  return createNewsService({
    fetchImpl,
    getApiKey: () => key,
    now: () => currentTime,
    sleep: async (milliseconds) => {
      onSleep(milliseconds);
      currentTime += milliseconds;
    }
  });
};

const callRouter = (router, query = {}) => new Promise((resolve, reject) => {
  const queryString = new URLSearchParams(query).toString();
  const response = {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name.toLowerCase()] = String(value); return this; },
    json(body) { this.body = body; resolve(this); return this; }
  };
  const request = {
    method: 'GET',
    url: `/${queryString ? `?${queryString}` : ''}`,
    originalUrl: `/api/news${queryString ? `?${queryString}` : ''}`,
    baseUrl: '/api/news',
    query,
    params: {}
  };
  router.handle(request, response, (error) => error && reject(error));
});

test('GET /api/news validates categories and returns cached, normalized, deduplicated newest-first articles', async () => {
  const calls = [];
  const waits = [];
  const providerArticles = {
    cryptocurrency: [
      sample('crypto-1', 'Crypto update', '2026-01-06T08:00:00Z', 'https://news.example.test/story?utm_source=crypto', 'Crypto'),
      sample('bad-url', 'Unsafe link', '2026-01-09T00:00:00Z', 'javascript:alert(1)', 'Crypto')
    ],
    stock_market: [
      sample('duplicate-1', 'Duplicate syndicated report', '2026-01-08T10:00:00Z', 'https://news.example.test/story?utm_medium=stocks', 'Stocks'),
      sample('stocks-1', 'Markets close higher', '2026-01-08T14:00:00Z', 'https://news.example.test/markets-close', 'Stocks')
    ],
    economy: [sample('economy-1', 'Inflation cools', '2026-01-03T10:00:00Z', 'https://news.example.test/inflation', 'Economy')],
    regulation: [sample('reg-1', 'New rules announced', '2026-01-07T10:00:00Z', 'https://news.example.test/rules', 'Regulation')]
  };
  const service = makeService(async (url, options) => {
    const requestUrl = new URL(url);
    const category = Object.keys(NEWS_CATEGORIES).find((key) => requestUrl.searchParams.get('q') === NEWS_CATEGORIES[key].query);
    assert.ok(category, 'provider request uses a fixed category query');
    assert.equal(requestUrl.searchParams.get('max'), '10');
    assert.equal(requestUrl.searchParams.get('lang'), 'en');
    assert.equal(requestUrl.searchParams.get('sortby'), 'publishedAt');
    assert.equal(options.headers['X-Api-Key'], 'unit-test-key');
    assert.equal(options.headers.Accept, 'application/json');
    calls.push(category);
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => ({ totalArticles: providerArticles[category].length, articles: providerArticles[category] })
    };
  }, 'unit-test-key', (milliseconds) => waits.push(milliseconds));

  const router = createNewsRouter(service);
  const invalid = await callRouter(router, { category: 'all OR 1=1' });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.body.success, false);
  assert.equal(calls.length, 0, 'invalid category makes no provider call');
  const repeatedCategory = await callRouter(router, { category: ['all', 'economy'] });
  assert.equal(repeatedCategory.statusCode, 400, 'repeated category parameters are rejected');

  const response = await callRouter(router);
  assert.equal(response.statusCode, 200);
  const payload = response.body;
  assert.equal(payload.success, true);
  assert.equal(payload.meta.category, 'all');
  assert.equal(payload.meta.cached, false);
  assert.equal(payload.meta.retrievedAt, '2026-01-10T12:00:03.300Z');
  assert.equal(calls.length, 4);
  assert.deepEqual(waits, [1100, 1100, 1100], 'GNews Free requests are spaced at least one second apart');
  assert.deepEqual(payload.data.map((article) => article.headline), [
    'Markets close higher',
    'New rules announced',
    'Crypto update',
    'Inflation cools'
  ]);
  assert.equal(new Set(payload.data.map((article) => article.url)).size, payload.data.length);
  assert.equal(payload.data[0].category, 'stock_market');
  assert.equal(payload.data[2].publisher, 'Crypto publisher');
  assert.equal(payload.data[2].summary, '<b>Crypto update summary</b>');
  assert.match(payload.data[2].url, /utm_source=crypto/, 'the response keeps the original publisher URL');
  assert.equal(payload.data[0].publishedAt, '2026-01-08T14:00:00.000Z');
  assert.notEqual(payload.meta.retrievedAt, payload.data[0].publishedAt);
  assert.equal(payload.data.every((article) => Object.hasOwn(article, 'imageUrl')), true);

  const cached = await callRouter(router);
  const cachedPayload = cached.body;
  assert.equal(cachedPayload.meta.cached, true);
  assert.equal(calls.length, 4, 'a repeat request uses the two-hour in-memory cache');

  const crypto = await callRouter(router, { category: 'cryptocurrency' });
  const cryptoPayload = crypto.body;
  assert.equal(cryptoPayload.meta.category, 'cryptocurrency');
  assert.equal(cryptoPayload.meta.cached, true, 'all-news searches also warm category caches');
  assert.equal(cryptoPayload.data.length, 1);
});

test('category requests are coalesced and expired data is served with a stale marker on provider failure', async () => {
  let currentTime = Date.parse('2026-01-10T12:00:00.000Z');
  let failProvider = false;
  let calls = 0;
  const service = createNewsService({
    getApiKey: () => 'unit-test-key',
    now: () => currentTime,
    sleep: async (milliseconds) => { currentTime += milliseconds; },
    fetchImpl: async () => {
      calls += 1;
      if (failProvider) return { ok: false, status: 503, headers: { get: () => null } };
      return {
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          totalArticles: 1,
          articles: [sample('economy-1', 'Rates remain steady', '2026-01-10T10:00:00Z', 'https://news.example.test/rates', 'Economy')]
        })
      };
    }
  });

  const first = service.getNews('economy');
  const overlapping = service.getNews('economy');
  const [firstResult, overlappingResult] = await Promise.all([first, overlapping]);
  assert.equal(calls, 1, 'concurrent requests share the same provider call');
  assert.equal(firstResult.data[0].headline, overlappingResult.data[0].headline);

  currentTime += 3 * 60 * 60 * 1000;
  failProvider = true;
  const staleResult = await service.getNews('economy');
  assert.equal(calls, 2);
  assert.equal(staleResult.meta.stale, true);
  assert.equal(staleResult.data[0].headline, 'Rates remain steady');
});

test('provider failures return a clear service error and missing credentials do not call GNews', async () => {
  const failedService = makeService(async () => ({
    ok: false,
    status: 429,
    headers: { get: () => '5' }
  }));
  await assert.rejects(failedService.getNews('economy'), (error) => {
    assert.ok(error instanceof NewsServiceError);
    assert.equal(error.status, 503);
    assert.equal(error.retryAfter, 5);
    assert.match(error.message, /too quickly/i);
    return true;
  });

  const endpointFailure = await callRouter(createNewsRouter(makeService(async () => ({
    ok: false,
    status: 429,
    headers: { get: () => '5' }
  }))), { category: 'economy' });
  assert.equal(endpointFailure.statusCode, 503);
  assert.equal(endpointFailure.headers['retry-after'], '5');
  assert.match(endpointFailure.body.message, /too quickly/i);

  let providerCalls = 0;
  const missingKeyService = makeService(async () => { providerCalls += 1; }, '');
  await assert.rejects(missingKeyService.getNews('regulation'), (error) => {
    assert.equal(error.status, 503);
    assert.match(error.message, /GNEWS_API_KEY/);
    return true;
  });
  assert.equal(providerCalls, 0);
});

const createFrontendHarness = async (fetchImpl, { waitForLoad = true } = {}) => {
  const buttons = ['all', 'cryptocurrency', 'stock_market', 'economy', 'regulation'].map((category) => {
    const button = new FakeElement('button');
    button.dataset.newsFilter = category;
    return button;
  });
  const grid = new FakeElement('div');
  const status = new FakeElement('p');
  const elements = new Map([['community-news-grid', grid], ['community-news-status', status]]);
  const intervalCallbacks = [];
  const document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: (id) => elements.get(id) || null,
    querySelectorAll: (selector) => selector === '[data-news-filter]' ? buttons : [],
    createElement: (tag) => new FakeElement(tag),
    addEventListener() {}
  };
  const window = {
    ApiClient: { API_BASE: 'http://localhost:5000/api' },
    setInterval(callback) { intervalCallbacks.push(callback); return 1; }
  };
  const context = {
    window,
    document,
    fetch: fetchImpl,
    URL,
    Response,
    Intl,
    Date,
    Number,
    Object,
    String,
    Array,
    Map
  };
  const script = await readFile(join(root, '..', 'js', 'communityNews.js'), 'utf8');
  vm.runInNewContext(script, context, { filename: 'communityNews.js' });
  const pending = window.refreshCommunityNews();
  if (waitForLoad) await pending;
  return { buttons, document, grid, intervalCallbacks, pending, status, window };
};

test('frontend category filters render safely, sort articles, and secure external links', async () => {
  const hostileHeadline = '<img src=x onerror="alert(1)"> Market update';
  const articles = [
    {
      id: 'older', headline: 'Older market update', summary: '<script>alert(1)</script>', publisher: 'Publisher',
      url: 'https://publisher.example.test/older', publishedAt: '2026-01-01T00:00:00Z', category: 'cryptocurrency',
      imageUrl: 'https://images.example.test/older.jpg'
    },
    {
      id: 'newer', headline: hostileHeadline, summary: '<b>untrusted summary</b>', publisher: 'Publisher',
      url: 'https://publisher.example.test/newer', publishedAt: '2026-01-03T00:00:00Z', category: 'cryptocurrency',
      imageUrl: 'javascript:alert(1)'
    },
    {
      id: 'unsafe-link', headline: 'Unsafe article', summary: '', publisher: 'Publisher',
      url: 'javascript:alert(1)', publishedAt: '2026-01-04T00:00:00Z', category: 'economy', imageUrl: null
    },
    {
      id: 'stocks', headline: 'Stock market update', summary: '', publisher: 'Publisher',
      url: 'https://publisher.example.test/stocks', publishedAt: '2026-01-02T00:00:00Z', category: 'stock_market', imageUrl: null
    }
  ];
  let fetchCalls = 0;
  const { buttons, grid, status } = await createFrontendHarness(async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({
      success: true,
      data: articles,
      meta: { category: 'all', retrievedAt: '2026-01-10T12:00:00Z', cached: false, partial: false, stale: false }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  assert.equal(fetchCalls, 1, 'the initial and overlapping refreshes share one request');
  assert.equal(grid.children.length, 3, 'unsafe article URLs are discarded');
  const firstCardBody = grid.children[0].children.at(-1);
  assert.equal(firstCardBody.children[1].textContent, hostileHeadline, 'headline is inserted as plain text');
  assert.equal(firstCardBody.children[2].textContent, '<b>untrusted summary</b>', 'summary is inserted as plain text');
  const readLink = firstCardBody.children.at(-1);
  assert.equal(readLink.target, '_blank');
  assert.equal(readLink.rel, 'noopener noreferrer');
  assert.equal(readLink.href, 'https://publisher.example.test/newer');
  assert.equal(firstCardBody.children.some((child) => child.tagName === 'IMG'), false, 'unsafe image URLs are omitted');

  buttons[1].click();
  assert.equal(grid.children.length, 2);
  assert.deepEqual(grid.children.map((card) => card.children.at(-1).children[1].textContent), [
    hostileHeadline,
    'Older market update'
  ]);
  assert.equal(buttons[1].getAttribute('aria-pressed'), 'true');
  assert.match(status.textContent, /Retrieved from GNews/);
});

test('frontend shows explicit empty and error states without substitute articles', async () => {
  const empty = await createFrontendHarness(async () => new Response(JSON.stringify({
    success: true,
    data: [],
    meta: { category: 'all', retrievedAt: '2026-01-10T12:00:00Z', cached: false, partial: false, stale: false }
  }), { status: 200 }));
  assert.equal(empty.grid.children.length, 0);
  assert.equal(empty.status.dataset.state, 'empty');
  assert.match(empty.status.textContent, /No all news articles/i);

  const failed = await createFrontendHarness(async () => new Response(JSON.stringify({
    success: false,
    message: 'News is not configured yet.'
  }), { status: 503 }));
  assert.equal(failed.grid.children.length, 0);
  assert.equal(failed.status.dataset.state, 'error');
  assert.match(failed.status.textContent, /News is not configured/i);
});

test('frontend exposes loading state and refreshes only while visible without overlapping requests', async () => {
  let resolveRequest;
  let fetchCalls = 0;
  const waitingForNews = new Promise((resolve) => { resolveRequest = resolve; });
  const loading = await createFrontendHarness(() => {
    fetchCalls += 1;
    return waitingForNews;
  }, { waitForLoad: false });
  assert.equal(loading.status.dataset.state, 'loading');
  assert.equal(fetchCalls, 1);

  resolveRequest(new Response(JSON.stringify({
    success: true,
    data: [],
    meta: { category: 'all', retrievedAt: '2026-01-10T12:00:00Z', cached: false, partial: false, stale: false }
  }), { status: 200 }));
  await loading.pending;
  assert.equal(loading.status.dataset.state, 'empty');

  loading.intervalCallbacks[0]();
  await loading.window.refreshCommunityNews();
  assert.equal(fetchCalls, 2, 'the scheduled refresh runs as one in-flight request');
  loading.document.visibilityState = 'hidden';
  loading.intervalCallbacks[0]();
  assert.equal(fetchCalls, 2, 'background tabs do not trigger refresh calls');
});

test('Community News follows the existing Ideas section and leaves its route and module registered', async () => {
  const html = await readFile(join(root, '..', 'index.html'), 'utf8');
  const ideasIndex = html.indexOf('<section class="ideas-section"');
  const newsIndex = html.indexOf('<section class="community-news-section"');
  const footerIndex = html.indexOf('<!-- FOOTER -->');
  assert.ok(ideasIndex >= 0 && ideasIndex < newsIndex && newsIndex < footerIndex);
  assert.match(html, /js\/communityIdeas\.js/);
  assert.match(html, /js\/communityNews\.js/);

  const marketRoutes = await readFile(join(root, 'routes', 'marketRoutes.js'), 'utf8');
  const ideasModule = await readFile(join(root, '..', 'js', 'communityIdeas.js'), 'utf8');
  const server = await readFile(join(root, 'server.js'), 'utf8');
  assert.match(marketRoutes, /router\.get\('\/ideas', getMarketIdeas\)/);
  assert.match(ideasModule, /\/market\/ideas/);
  assert.match(server, /app\.use\('\/api\/market', marketRoutes\)/);
  assert.match(server, /app\.use\('\/api\/news', newsRoutes\)/);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.parentNode = null;
    this.classList = {
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        if (force) names.add(name);
        else names.delete(name);
        this.className = [...names].join(' ');
      }
    };
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
    });
  }

  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }

  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  click() { (this.listeners.get('click') || []).forEach((callback) => callback({ target: this })); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
}
