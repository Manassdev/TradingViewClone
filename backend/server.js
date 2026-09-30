import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import watchlistRoutes from './routes/watchlistRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import commentRoutes from './routes/commentRoutes.js';
import marketRoutes from './routes/marketRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { startAlertMonitor } from './services/alertMonitor.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { validateEnvironment } from './config/env.js';

// Load environment variables
dotenv.config();

let config;
try {
  config = validateEnvironment();
} catch (error) {
  console.error(`[Startup] ${error.message}`);
  process.exit(1);
}

const app = express();

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (like Postman, curl, server-to-server) or matching origins
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check API (Phase 9 requirement)
app.get('/api/health', (req, res) => {
  const isConnected = mongoose.connection.readyState === 1;
  const isAtlas = (process.env.MONGODB_URI || '').includes('mongodb.net') || (process.env.MONGODB_URI || '').includes('mongodb+srv://');

  res.json({
    status: 'ok',
    database: isConnected ? 'connected' : 'disconnected',
    databaseType: isAtlas ? 'MongoDB Atlas' : 'Local MongoDB (migrated instance)',
    databaseName: mongoose.connection.name || 'tradingview',
    collections: ['users', 'watchlist', 'alerts', 'comments', 'notifications'],
    timestamp: new Date().toISOString()
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes); // supports GET /api/users/me
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/market', marketRoutes);

// Error Handling Middlewares
app.use(notFound);
app.use(errorHandler);

// Start accepting requests only after MongoDB is available.
try {
  await connectDB();
  if (process.env.NODE_ENV === 'test') {
    console.info('[AlertMonitor] Automatic polling disabled in test mode.');
  } else {
    startAlertMonitor();
  }
  app.listen(config.port, () => {
    console.log(`[Express] TradingView Clone Backend running on port ${config.port}`);
    console.log(`[Express] Health check available at /api/health`);
  });
} catch (error) {
  console.error(`[Startup] ${error.message}`);
  process.exit(1);
}
