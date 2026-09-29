const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { notFound, errorHandler } = require('./middleware/errors');

function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000,http://127.0.0.1:8000')
    .split(',').map((origin) => origin.trim()).filter(Boolean);

  app.disable('x-powered-by');
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.binance.com', 'wss://stream.binance.com:9443'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null
    } }
  }));
  app.use(cors({ origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  }, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use(express.json({ limit: '32kb' }));
  app.use((req, res, next) => { req.body = req.body || {}; next(); });
  app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use(['/api/auth/signup', '/api/auth/login'], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false }));

  app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'database_unavailable' });
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/watchlist', require('./routes/watchlist'));
  app.use('/api/alerts', require('./routes/alerts'));
  app.use('/api/portfolio', require('./routes/portfolio'));

  const frontendRoot = path.join(__dirname, '..');
  app.get('/', (req, res) => res.sendFile(path.join(frontendRoot, 'index.html')));
  app.get(['/index.html', '/signin.html', '/signup.html', '/idea.html'], (req, res) => res.sendFile(path.join(frontendRoot, path.basename(req.path))));
  app.get('/styles.css', (req, res) => res.sendFile(path.join(frontendRoot, 'styles.css')));
  app.use('/css', express.static(path.join(frontendRoot, 'css')));
  app.use('/js', express.static(path.join(frontendRoot, 'js')));
  app.use('/assets', express.static(path.join(frontendRoot, 'assets')));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
