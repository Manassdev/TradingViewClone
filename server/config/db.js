const mongoose = require('mongoose');

function validateAtlasUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) throw new Error('MONGODB_URI is missing from .env');
  const match = uri.match(/^mongodb\+srv:\/\/(?:[^@/]+@)?([^/?#]+)/i);
  if (!match || !match[1].toLowerCase().endsWith('.mongodb.net')) {
    throw new Error('MONGODB_URI must be an Atlas mongodb+srv URI whose host ends in .mongodb.net');
  }
}

function describeConnectionError(error) {
  const knownConfigurationError = [
    'MONGODB_URI is missing from .env',
    'MONGODB_URI must be an Atlas mongodb+srv URI whose host ends in .mongodb.net'
  ];
  if (knownConfigurationError.includes(error.message)) return error.message;
  const code = error.code || error.cause?.code;
  if (code === 18 || code === 8000) return 'Atlas rejected the database credentials or permissions. Check the Atlas database user.';
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ETIMEDOUT') {
    return `Atlas host is unreachable (${code}). Check the cluster hostname and Atlas Network Access IP allowlist.`;
  }
  return `MongoDB Atlas connection failed (${error.name || 'Error'}${code ? `, code ${code}` : ''}). Check cluster status, network access, and the database user.`;
}

async function connectDatabase(uri = process.env.MONGODB_URI, options = {}) {
  validateAtlasUri(uri);
  const timeout = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000;
  mongoose.connection.on('disconnected', () => console.error('MongoDB Atlas connection lost; Mongoose is reconnecting.'));
  mongoose.connection.on('error', (error) => {
    console.error('MongoDB Atlas connection error:', error.name || 'Error', error.code || error.cause?.code || '');
  });
  await mongoose.connect(uri, {
    dbName: options.dbName || 'tradingview',
    serverSelectionTimeoutMS: timeout,
    autoIndex: false
  });
  return mongoose.connection;
}

module.exports = { connectDatabase, validateAtlasUri, describeConnectionError };
