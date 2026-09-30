const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  symbols: { type: [String], default: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT'] },
  favorites: { type: [String], default: [] }
}, { timestamps: true, collection: 'watchlist' });

module.exports = mongoose.model('Watchlist', watchlistSchema);
