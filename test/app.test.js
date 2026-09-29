const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');

const server = createApp();
let origin;
before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

test('serves the existing frontend and keeps Binance connections allowed by CSP', async () => {
  const response = await fetch(`${origin}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /TradingView Clone|TradingView/);
  assert.match(response.headers.get('content-security-policy'), /wss:\/\/stream\.binance\.com:9443/);
});

test('health endpoint reports the MongoDB connection state without revealing configuration', async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'database_unavailable' });
});

test('account APIs reject requests without a bearer token', async () => {
  const response = await fetch(`${origin}/api/watchlist`);
  assert.equal(response.status, 401);
});

test('signup rejects weak passwords before touching the database', async () => {
  const response = await fetch(`${origin}/api/auth/signup`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'validname', email: 'valid@example.com', password: 'weak' })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /8–72/);
});

test('backend implementation and environment template are not web-served', async () => {
  for (const path of ['/server.js', '/server/models/User.js', '/.env.example']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, `${path} should not be exposed`);
  }
});
