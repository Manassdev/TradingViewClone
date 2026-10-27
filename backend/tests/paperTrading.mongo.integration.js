import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../models/User.js';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(backendDirectory, '.env') });

const TEST_DATABASE = 'tradingview_integration_test';
const baseMongoUri = process.env.MONGODB_URI;
if (!baseMongoUri) throw new Error('MONGODB_URI is not configured; integration test stopped before connecting.');
const testMongoUrl = new URL(baseMongoUri);
testMongoUrl.pathname = `/${TEST_DATABASE}`;
const testMongoUri = testMongoUrl.toString();
const runId = randomUUID();
const testUserEmails = [];
const jwtSecret = randomBytes(48).toString('base64url');
let backendProcess = null;
let apiBase = null;

const allocatePort = async () => new Promise((resolvePort, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close((error) => error ? reject(error) : resolvePort(port));
  });
});

const startTestBackend = async (port) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDirectory,
    env: { ...process.env, PORT: String(port), MONGODB_URI: testMongoUri, JWT_SECRET: jwtSecret, NODE_ENV: 'test' },
    stdio: 'ignore',
    windowsHide: true
  });
  backendProcess = child;
  apiBase = `http://127.0.0.1:${port}/api`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Isolated backend exited before it became healthy.');
    try {
      const response = await fetch(`${apiBase}/health`);
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.database, 'connected');
        assert.equal(health.databaseName, TEST_DATABASE, 'Active database must be the isolated integration database before test writes.');
        return;
      }
    } catch { /* The backend may still be starting. */ }
    await delay(250);
  }
  throw new Error('Isolated test backend did not become healthy.');
};

const stopTestBackend = async () => {
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  if (child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill();
  await Promise.race([exited, delay(3_000)]);
  if (child.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* The child may have exited concurrently. */ }
    await Promise.race([exited, delay(3_000)]);
  }
  if (child.exitCode === null) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(500) });
      } catch {
        return;
      }
      await delay(200);
    }
    throw new Error('Isolated backend is still responding after its process stop request.');
  }
};

const request = async (path, { token, body, idempotencyKey, method } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${apiBase}${path}`, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
};

const createTestAccount = async (label) => {
  const suffix = `${runId.slice(0, 8)}-${label}-${randomUUID().slice(0, 8)}`;
  const account = {
    name: `Integration ${label}`,
    username: `it-${runId.slice(0, 8)}-${label}-${randomUUID().slice(0, 4)}`,
    email: `${suffix}@integration.invalid`,
    password: `T!${randomBytes(24).toString('base64url')}`
  };
  testUserEmails.push(account.email);
  const registered = await request('/auth/register', { body: account });
  assert.equal(registered.status, 201, 'Test account registration should succeed.');
  assert.ok(registered.data?.token, 'Registration should return a session token.');
  return { account, token: registered.data.token, userId: registered.data.user.id };
};

const assertOrderError = async (path, { token, body, status, idempotencyKey }) => {
  const response = await request(path, { token, body, idempotencyKey });
  assert.equal(response.status, status);
  assert.equal(response.data?.success, false);
  return response;
};

async function cleanupTestRecords() {
  if (mongoose.connection.name !== TEST_DATABASE) throw new Error('Cleanup refused: active database is not the isolated integration database.');
  if (testUserEmails.length === 0) return;
  const users = await User.find({ email: { $in: testUserEmails } }).select('_id').lean();
  const ids = users.map((user) => user._id);
  if (ids.length === 0) return;
  await Promise.all([
    mongoose.connection.collection('users').deleteMany({ _id: { $in: ids } }),
    mongoose.connection.collection('paper_portfolios').deleteMany({ userId: { $in: ids } }),
    mongoose.connection.collection('watchlist').deleteMany({ user: { $in: ids } }),
    mongoose.connection.collection('alerts').deleteMany({ userId: { $in: ids } }),
    mongoose.connection.collection('comments').deleteMany({ userId: { $in: ids } }),
    mongoose.connection.collection('notifications').deleteMany({ userId: { $in: ids } })
  ]);
}

let cleanupSucceeded = false;
try {
  const configuredDatabase = decodeURIComponent(new URL(baseMongoUri).pathname.replace(/^\//, ''));
  if (configuredDatabase === 'tradingview' || configuredDatabase === TEST_DATABASE) {
    // Only the explicit test database URI is used below; production is never opened by this runner.
  }
  await mongoose.connect(testMongoUri, { serverSelectionTimeoutMS: 5_000 });
  assert.equal(mongoose.connection.name, TEST_DATABASE, 'Preflight connection must resolve to the isolated database.');
  console.log(`Verified isolated MongoDB database: ${TEST_DATABASE}`);

  const port = await allocatePort();
  await startTestBackend(port);
  console.log('Dedicated integration API health check confirmed the isolated database before test writes.');

  const primary = await createTestAccount('primary');
  const second = await createTestAccount('second');
  const concurrent = await createTestAccount('concurrent');

  const storedUser = await User.findById(primary.userId).select('+passwordHash').lean();
  assert.ok(/^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(storedUser.passwordHash));
  assert.notEqual(storedUser.passwordHash, primary.account.password);
  const login = await request('/auth/login', { body: { email: primary.account.email, password: primary.account.password } });
  assert.equal(login.status, 200);
  const token = login.data.token;
  assert.ok(token);
  assert.equal((await request('/auth/login', { body: { email: primary.account.email, password: 'wrong-password' } })).status, 401);
  assert.equal((await request('/users/me', { token })).status, 200);

  assert.equal((await request('/paper-trading')).status, 401, 'Unauthenticated portfolio requests must be rejected.');
  const starting = await request('/paper-trading', { token });
  assert.equal(starting.status, 200);
  assert.equal(starting.data.data.initialBalance, 100_000);
  assert.equal(starting.data.data.cash, 100_000);
  assert.equal(starting.data.data.trades.length, 0);
  const secondStarting = await request('/paper-trading', { token: second.token });
  assert.equal(secondStarting.data.data.cash, 100_000);
  assert.equal(secondStarting.data.data.trades.length, 0);

  const malformed = await assertOrderError('/paper-trading/orders', {
    token, body: { symbol: 'BTCUSDT', side: 'buy', quantity: 0 }, status: 400, idempotencyKey: randomUUID()
  });
  void malformed;
  await assertOrderError('/paper-trading/orders', {
    token, body: { symbol: 'BTCUSDT', side: 'buy', amountUsdt: -1 }, status: 400, idempotencyKey: randomUUID()
  });
  await assertOrderError('/paper-trading/orders', {
    token, body: { symbol: 'FAKEUSDT', side: 'buy', quantity: 1 }, status: 400, idempotencyKey: randomUUID()
  });
  await assertOrderError('/paper-trading/orders', {
    token, body: { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 100_001 }, status: 400, idempotencyKey: randomUUID()
  });

  const key = randomUUID();
  const buyRequest = { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 25 };
  const buy = await request('/paper-trading/orders', { token, body: buyRequest, idempotencyKey: key });
  assert.equal(buy.status, 201, 'A valid test buy should execute once.');
  assert.equal(buy.data.trade.side, 'buy');
  assert.ok(buy.data.trade.quantity > 0);
  assert.ok(buy.data.trade.notional <= 25);
  assert.equal(Number((100_000 - buy.data.data.cash).toFixed(8)), buy.data.trade.notional);
  assert.equal(buy.data.data.holdings.length, 1);
  assert.equal(buy.data.data.trades.length, 1);

  const duplicate = await request('/paper-trading/orders', { token, body: buyRequest, idempotencyKey: key });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.duplicate, true);
  assert.deepEqual(duplicate.data.trade, buy.data.trade);
  await assertOrderError('/paper-trading/orders', {
    token, body: { ...buyRequest, amountUsdt: 30 }, status: 409, idempotencyKey: key
  });
  let primaryPortfolio = (await request('/paper-trading', { token })).data.data;
  assert.equal(primaryPortfolio.trades.length, 1, 'Replays and payload conflicts must not duplicate the trade.');

  const tooMuchToSell = Number((buy.data.trade.quantity + 0.00000001).toFixed(8));
  await assertOrderError('/paper-trading/orders', {
    token, body: { symbol: 'BTCUSDT', side: 'sell', quantity: tooMuchToSell }, status: 400, idempotencyKey: randomUUID()
  });
  primaryPortfolio = (await request('/paper-trading', { token })).data.data;
  assert.equal(primaryPortfolio.trades.length, 1, 'Rejected oversells must not alter history.');

  const partialQuantity = Math.floor(buy.data.trade.quantity * 0.4 * 1e8) / 1e8;
  assert.ok(partialQuantity > 0 && partialQuantity < buy.data.trade.quantity);
  const partialSell = await request('/paper-trading/orders', {
    token,
    body: { symbol: 'BTCUSDT', side: 'sell', quantity: partialQuantity },
    idempotencyKey: randomUUID()
  });
  assert.equal(partialSell.status, 201);
  assert.ok(partialSell.data.data.holdings[0].quantity > 0);
  const remaining = partialSell.data.data.holdings[0].quantity;
  const close = await request('/paper-trading/orders', {
    token,
    body: { symbol: 'BTCUSDT', side: 'sell', quantity: remaining },
    idempotencyKey: randomUUID()
  });
  assert.equal(close.status, 201);
  assert.equal(close.data.data.holdings.length, 0);
  assert.equal(close.data.data.trades.length, 3);
  assert.equal(Number(close.data.data.realizedPnl.toFixed(8)), Number(close.data.data.trades.reduce((sum, trade) => sum + trade.realizedPnl, 0).toFixed(8)));
  assert.ok(Math.abs(close.data.data.totalPnl - close.data.data.realizedPnl) < 0.0000001);

  const concurrentOrders = await Promise.all([
    request('/paper-trading/orders', { token: concurrent.token, body: { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 70_000 }, idempotencyKey: randomUUID() }),
    request('/paper-trading/orders', { token: concurrent.token, body: { symbol: 'BTCUSDT', side: 'buy', amountUsdt: 70_000 }, idempotencyKey: randomUUID() })
  ]);
  assert.equal(concurrentOrders.filter((result) => result.status === 201).length, 1);
  assert.equal(concurrentOrders.filter((result) => result.status === 400).length, 1);
  const concurrentPortfolio = (await request('/paper-trading', { token: concurrent.token })).data.data;
  assert.equal(concurrentPortfolio.trades.length, 1);
  assert.ok(concurrentPortfolio.cash >= 0);

  const beforeRestart = (await request('/paper-trading', { token })).data.data;
  await stopTestBackend();
  await startTestBackend(port);
  const afterRestart = await request('/paper-trading', { token });
  assert.equal(afterRestart.status, 200);
  assert.equal(afterRestart.data.data.cash, beforeRestart.cash);
  assert.deepEqual(afterRestart.data.data.trades, beforeRestart.trades);
  assert.deepEqual(afterRestart.data.data.holdings, beforeRestart.holdings);
  assert.equal((await request('/users/me', { token })).status, 200, 'The same isolated session should restore after backend restart.');

  const logout = await request('/auth/logout', { token, method: 'POST', body: {} });
  assert.equal(logout.status, 200);
  assert.equal((await request('/paper-trading', { token })).status, 401);
  console.log('Integration checks passed: registration/hash/login/session, protected portfolio access, buy/partial sell/full close, invalid orders, idempotency conflicts/replay, concurrent spending, and persistence across backend restart.');
} finally {
  await stopTestBackend().catch(() => {});
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === TEST_DATABASE) {
    try {
      await cleanupTestRecords();
      cleanupSucceeded = true;
    } finally {
      await mongoose.disconnect();
    }
  }
  if (cleanupSucceeded) console.log('Cleanup completed: test users and their related records were removed from the isolated database.');
  else if (testUserEmails.length) console.error(`Cleanup requires review in ${TEST_DATABASE}; no other database was targeted.`);
}
