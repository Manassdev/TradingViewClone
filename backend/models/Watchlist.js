import mongoose from 'mongoose';

const watchlistSchema = new mongoose.Schema({
  // The existing MongoDB collection validator and unique index use `user`.
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    unique: true
  },

  // Legacy per-asset records may still use userId; new records use user.
  userId: {
    type: mongoose.Schema.Types.Mixed
  },

  // Retained so records from the earlier per-asset API remain readable.
  symbol: {
    type: String,
    uppercase: true,
    trim: true
  },
  assetType: {
    type: String,
    enum: ['stock', 'crypto', 'india_stock', 'india_index']
  },
  exchange: {
    type: String,
    uppercase: true,
    trim: true
  },
  provider: {
    type: String,
    trim: true
  },
  displayName: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Legacy fields: retained so existing documents remain readable and intact.
  name: String,
  symbols: {
    type: [String],
    default: []
  },
  favorites: {
    type: [String],
    default: []
  },
  updatedAt: Date
}, {
  timestamps: false,
  collection: 'watchlist'
});

// Legacy list documents have no `symbol`, so the partial index leaves them out.
watchlistSchema.index(
  { userId: 1, assetType: 1, symbol: 1 },
  {
    unique: true,
    partialFilterExpression: { symbol: { $type: 'string' } },
    name: 'uniq_user_watchlist_asset'
  }
);

const Watchlist = mongoose.model('Watchlist', watchlistSchema);
export default Watchlist;
