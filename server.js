require('dotenv').config();
const { createApp } = require('./server/app');
const { connectDatabase } = require('./server/config/db');

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.startsWith('replace-with-')) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  await connectDatabase();
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`TradingView Clone server listening on port ${port}`));
}

if (require.main === module) {
  start().catch(() => {
    console.error('Server startup failed. Check MongoDB connectivity and server configuration.');
    process.exit(1);
  });
}

module.exports = { start };
