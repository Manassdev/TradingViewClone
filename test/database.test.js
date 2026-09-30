const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateAtlasUri, describeConnectionError } = require('../server/config/db');
const { collections } = require('../scripts/db-init');

test('database connection is restricted to MongoDB Atlas SRV hosts', () => {
  assert.doesNotThrow(() => validateAtlasUri('mongodb+srv://user:secret@cluster0.example.mongodb.net/?retryWrites=true'));
  assert.throws(() => validateAtlasUri('mongodb://127.0.0.1:27017/test'), /Atlas mongodb\+srv/);
  assert.throws(() => validateAtlasUri('mongodb+srv://user:secret@not-atlas.example.com/db'), /Atlas mongodb\+srv/);
  assert.throws(() => validateAtlasUri(''), /MONGODB_URI is missing/);
});

test('connection diagnostics do not reveal URI credentials', () => {
  const error = new Error('bad connection string mongodb+srv://private-user:private-password@cluster.mongodb.net');
  error.name = 'MongoServerSelectionError';
  const message = describeConnectionError(error);
  assert.doesNotMatch(message, /private-user|private-password|cluster\.mongodb/);
  assert.match(message, /MongoDB Atlas connection failed/);
});

test('Mongoose models map to the six required Atlas collection names', () => {
  assert.deepEqual(collections.map(({ name, model }) => [name, model.collection.name]), [
    ['users', 'users'], ['watchlist', 'watchlist'], ['alertss', 'alertss'],
    ['portfolios', 'portfolios'], ['orders', 'orders'], ['transactions', 'transactions']
  ]);
  for (const entry of collections) assert.ok(entry.validator.$jsonSchema, `${entry.name} must have a MongoDB validator`);
});
