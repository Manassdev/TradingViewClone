import mongoose from 'mongoose';

const watchlistSchema = new mongoose.Schema({
  // Mixed preserves compatibility with existing string and ObjectId owner IDs.
  userId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // New records represent one selected asset. Legacy list documents below keep
  // their symbols array and are read without a destructive migration.
  symbol: {
    type: String,
    uppercase: true,
    trim: true
  },
  assetType: {
    type: String,
    enum: ['stock', 'crypto']
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
    default: undefined
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
