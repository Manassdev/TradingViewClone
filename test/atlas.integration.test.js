const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { connectDatabase } = require('../server/config/db');
const { initializeDatabase } = require('../scripts/db-init');
const { createApp } = require('../server/app');
const User = require('../server/models/User');
const Watchlist = require('../server/models/Watchlist');
const Alert = require('../server/models/Alert');
const Portfolio = require('../server/models/Portfolio');
const Order = require('../server/models/Order');
const Transaction = require('../server/models/Transaction');

const testUri = process.env.MONGODB_TEST_URI;
const testDatabase = process.env.MONGODB_TEST_DB || 'tradingview_test';

test('Atlas integration: connection, authentication, ownership, and account APIs', { skip: !testUri }, async () => {
  assert.match(testDatabase, /^tradingview_test(?:_[a-z0-9]+)?$/i, 'refusing to use a non-test database name');
  await connectDatabase(testUri, { dbName: testDatabase });
  let server;
  const accountIds = [];
  try {
    const initialized = await initializeDatabase();
    assert.equal(initialized.length, 6);
    const initializedAgain = await initializeDatabase();
    assert.deepEqual(initializedAgain.map(({ name }) => name), initialized.map(({ name }) => name));
    const app = createApp();
    await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(`${origin}${path}`, options);
    const createAccount = async () => {
      const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
      const password = `Test-${crypto.randomBytes(10).toString('hex')}!`;
      const response = await request('/api/auth/signup', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: `tv_${suffix}`, email: `tv_${suffix}@example.test`, password })
      });
      assert.equal(response.status, 201);
      const body = await response.json();
      accountIds.push(body.user.id);
      assert.ok(!Object.hasOwn(body.user, 'passwordHash'));
      const stored = await User.findById(body.user.id).select('+passwordHash');
      assert.notEqual(stored.passwordHash, password);
      return { token: body.token, user: body.user, password };
    };
    const headers = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

    const first = await createAccount();
    const second = await createAccount();
    assert.equal((await request('/api/auth/me', { headers: headers(first.token) })).status, 200);

    const initialWatchlist = await (await request('/api/watchlist', { headers: headers(first.token) })).json();
    assert.ok(initialWatchlist.symbols.includes('BTCUSDT'));
    const putWatchlist = await request('/api/watchlist', {
      method: 'PUT', headers: headers(first.token),
      body: JSON.stringify({ symbols: ['BTCUSDT'], favorites: ['BTCUSDT'] })
    });
    assert.equal(putWatchlist.status, 200);
    const secondWatchlist = await (await request('/api/watchlist', { headers: headers(second.token) })).json();
    assert.notDeepEqual(secondWatchlist.symbols, ['BTCUSDT']);

    const createdAlert = await request('/api/alerts', {
      method: 'POST', headers: headers(first.token),
      body: JSON.stringify({ symbol: 'BTCUSDT', condition: 'above', target: 70000 })
    });
    assert.equal(createdAlert.status, 201);
    const alert = (await createdAlert.json()).alert;
    assert.equal((await request(`/api/alerts/${alert._id}`, { method: 'DELETE', headers: headers(second.token) })).status, 404);
    assert.equal((await request('/api/alerts', { headers: headers(first.token) })).status, 200);

    const placed = await request('/api/portfolio/orders', {
      method: 'POST', headers: headers(first.token),
      body: JSON.stringify({ symbol: 'BTCUSDT', type: 'BUY', qty: 0.001, price: 1000 })
    });
    assert.equal(placed.status, 201);
    assert.equal((await placed.json()).order.status, 'FILLED');
    const portfolio = await (await request('/api/portfolio', { headers: headers(first.token) })).json();
    assert.equal(portfolio.portfolio.balance, 99999);
    assert.equal(portfolio.transactions.length, 1);
    const orders = await (await request('/api/portfolio/orders', { headers: headers(first.token) })).json();
    assert.equal(orders.orders.length, 1);

    const login = await request('/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: first.user.email, password: first.password })
    });
    assert.equal(login.status, 200);
    assert.equal((await request('/api/watchlist', { headers: { authorization: 'Bearer expired-token' } })).status, 401);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (accountIds.length) {
      await Promise.all([
        Watchlist.deleteMany({ user: { $in: accountIds } }), Alert.deleteMany({ user: { $in: accountIds } }),
        Order.deleteMany({ user: { $in: accountIds } }), Transaction.deleteMany({ user: { $in: accountIds } }),
        Portfolio.deleteMany({ user: { $in: accountIds } }), User.deleteMany({ _id: { $in: accountIds } })
      ]);
    }
    await mongoose.disconnect();
  }
});
