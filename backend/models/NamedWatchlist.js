import mongoose from 'mongoose';

const watchlistItemSchema = new mongoose.Schema({
  symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 30 },
  assetType: { type: String, required: true, enum: ['stock', 'crypto', 'forex', 'india_stock', 'india_index'] },
  exchange: { type: String, trim: true, uppercase: true, maxlength: 20, default: 'UNKNOWN' },
  provider: { type: String, trim: true, lowercase: true, maxlength: 40, default: 'manual' },
  providerSymbol: { type: String, trim: true, uppercase: true, maxlength: 40 },
  displayName: { type: String, trim: true, maxlength: 100 }
}, { timestamps: true });

const namedWatchlistSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
  items: { type: [watchlistItemSchema], default: [] }
}, { timestamps: true, collection: 'watchlists' });

namedWatchlistSchema.index(
  { owner: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 }, name: 'uniq_owner_watchlist_name' }
);

export default mongoose.models.NamedWatchlist || mongoose.model('NamedWatchlist', namedWatchlistSchema);
