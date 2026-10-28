import test from 'node:test';
import assert from 'node:assert/strict';
import { limitLoginAttempts, limitRegistrationAttempts } from '../middleware/authRateLimit.js';

const invoke = (middleware, ip) => {
  let status = 200;
  let body;
  const headers = {};
  const response = {
    set(name, value) { headers[name] = value; return this; },
    status(value) { status = value; return this; },
    json(value) { body = value; return this; }
  };
  let nextCalled = false;
  middleware({ ip, socket: {} }, response, () => { nextCalled = true; });
  return { status, body, headers, nextCalled };
};

test('login attempts are limited per client IP and include a retry interval', () => {
  const ip = '198.51.100.221';
  for (let i = 0; i < 10; i += 1) assert.equal(invoke(limitLoginAttempts, ip).nextCalled, true);
  const limited = invoke(limitLoginAttempts, ip);
  assert.equal(limited.status, 429);
  assert.match(limited.body.message, /login attempts/i);
  assert.ok(Number(limited.headers['Retry-After']) > 0);
});

test('registration has its own lower attempt limit', () => {
  const ip = '198.51.100.222';
  for (let i = 0; i < 5; i += 1) assert.equal(invoke(limitRegistrationAttempts, ip).nextCalled, true);
  const limited = invoke(limitRegistrationAttempts, ip);
  assert.equal(limited.status, 429);
  assert.match(limited.body.message, /registration attempts/i);
});
