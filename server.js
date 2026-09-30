require('dotenv').config();
const { createApp } = require('./server/app');
const { connectDatabase, describeConnectionError } = require('./server/config/db');
const { initializeDatabase } = require('./scripts/db-init');

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is missing from .env');
  if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET is shorter than 32 characters');
  if (process.env.JWT_SECRET.startsWith('replace-with-')) throw new Error('Replace the JWT_SECRET example placeholder in .env');
  try {
    await connectDatabase();
    const initialized = await initializeDatabase();
    console.log(`Verified ${initialized.length} required MongoDB collections and indexes.`);
  } catch (error) {
    throw new Error(describeConnectionError(error));
  }
  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, () => console.log(`TradingView Clone server listening on port ${port}; MongoDB database: tradingview`));
  return server;
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  });
}

module.exports = { start };
