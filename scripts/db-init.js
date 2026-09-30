require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase, describeConnectionError } = require('../server/config/db');
const User = require('../server/models/User');
const Watchlist = require('../server/models/Watchlist');
const Alert = require('../server/models/Alert');
const Portfolio = require('../server/models/Portfolio');
const Order = require('../server/models/Order');
const Transaction = require('../server/models/Transaction');

const collections = [
  { name: 'users', model: User, validator: { $jsonSchema: { bsonType: 'object', required: ['username', 'email', 'passwordHash'], properties: {
    username: { bsonType: 'string', minLength: 3, maxLength: 30 }, email: { bsonType: 'string', maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
    passwordHash: { bsonType: 'string', pattern: '^\\$2[ab]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$' }, avatar: { bsonType: 'string', maxLength: 40 }
  } } } },
  { name: 'watchlist', model: Watchlist, validator: { $jsonSchema: { bsonType: 'object', required: ['user', 'symbols', 'favorites'], properties: {
    user: { bsonType: 'objectId' }, symbols: { bsonType: 'array', maxItems: 100, items: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' } },
    favorites: { bsonType: 'array', maxItems: 100, items: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' } }
  } } } },
  { name: 'alertss', model: Alert, validator: { $jsonSchema: { bsonType: 'object', required: ['user', 'symbol', 'condition', 'target', 'active'], properties: {
    user: { bsonType: 'objectId' }, symbol: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' },
    condition: { enum: ['above', 'below'] }, target: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0.00000001 }, active: { bsonType: 'bool' }
  } } } },
  { name: 'portfolios', model: Portfolio, validator: { $jsonSchema: { bsonType: 'object', required: ['user', 'balance', 'holdings'], properties: {
    user: { bsonType: 'objectId' }, balance: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
    holdings: { bsonType: 'array', items: { bsonType: 'object', required: ['symbol', 'qty', 'avgPrice'], properties: {
      symbol: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' }, qty: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
      avgPrice: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 }
    } } }
  } } } },
  { name: 'orders', model: Order, validator: { $jsonSchema: { bsonType: 'object', required: ['user', 'portfolio', 'symbol', 'side', 'qty', 'price', 'total', 'status'], properties: {
    user: { bsonType: 'objectId' }, portfolio: { bsonType: 'objectId' }, symbol: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' },
    side: { enum: ['BUY', 'SELL'] }, qty: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
    price: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 }, total: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
    status: { enum: ['FILLED'] }
  } } } },
  { name: 'transactions', model: Transaction, validator: { $jsonSchema: { bsonType: 'object', required: ['user', 'portfolio', 'order', 'symbol', 'type', 'qty', 'price', 'total', 'createdAt'], properties: {
    user: { bsonType: 'objectId' }, portfolio: { bsonType: 'objectId' }, order: { bsonType: 'objectId' },
    symbol: { bsonType: 'string', pattern: '^[A-Z0-9]{2,20}$' }, type: { enum: ['BUY', 'SELL'] },
    qty: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 }, price: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 },
    total: { bsonType: ['double', 'int', 'long', 'decimal'], minimum: 0 }, createdAt: { bsonType: 'date' }
  } } } }
];

async function createMissingCollections(connection = mongoose.connection) {
  const db = connection.db;
  for (const entry of collections) {
    const info = await db.listCollections({ name: entry.name }, { nameOnly: false }).next();
    if (!info) {
      try {
        await db.createCollection(entry.name, {
          validator: entry.validator,
          validationLevel: 'strict',
          validationAction: 'error'
        });
        continue;
      } catch (error) {
        if (error.code !== 48) throw error; // Another initializer created it concurrently.
      }
    }
    // Keep pre-existing collection validators untouched; never replace existing DB rules.
    if (!info.options?.validator || Object.keys(info.options.validator).length === 0) {
      await db.command({
        collMod: entry.name,
        validator: entry.validator,
        validationLevel: 'strict',
        validationAction: 'error'
      });
    }
  }
}

async function verifyDatabase(connection = mongoose.connection) {
  const db = connection.db;
  const found = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name));
  const missing = collections.map((entry) => entry.name).filter((name) => !found.has(name));
  if (missing.length) throw new Error(`Required collections missing after initialization: ${missing.join(', ')}`);

  const result = [];
  for (const entry of collections) {
    const indexes = await entry.model.collection.indexes();
    for (const [keys, options] of entry.model.schema.indexes()) {
      const index = indexes.find((candidate) => JSON.stringify(candidate.key) === JSON.stringify(keys));
      if (!index || (options.unique && !index.unique)) {
        throw new Error(`Index verification failed for ${entry.name}`);
      }
    }
    const info = await db.listCollections({ name: entry.name }, { nameOnly: false }).next();
    if (!info?.options?.validator || Object.keys(info.options.validator).length === 0) {
      throw new Error(`Collection validation is missing for ${entry.name}`);
    }
    result.push({ name: entry.name, indexes: indexes.length, validation: 'enabled' });
  }
  return result;
}

async function initializeDatabase() {
  await createMissingCollections();
  // createIndexes adds missing declared indexes and does not remove unrelated indexes.
  for (const entry of collections) await entry.model.createIndexes();
  return verifyDatabase();
}

if (require.main === module) {
  connectDatabase().then(initializeDatabase).then((result) => {
    console.log(`Verified MongoDB database "${mongoose.connection.name}":`);
    for (const entry of result) console.log(`- ${entry.name}: ${entry.indexes} indexes, validation enabled`);
    return mongoose.disconnect();
  }).catch(async (error) => {
    console.error('Database initialization failed:', describeConnectionError(error));
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
}

module.exports = { collections, createMissingCollections, verifyDatabase, initializeDatabase };
