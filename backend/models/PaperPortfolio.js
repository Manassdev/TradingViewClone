import mongoose from 'mongoose';

const holdingSchema = new mongoose.Schema({
  symbol: { type: String, required: true, uppercase: true, trim: true },
  quantity: { type: Number, required: true, min: 0 },
  averageEntryPrice: { type: Number, required: true, min: 0 },
  openedAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true }
}, { _id: false });

const tradeSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  requestFingerprint: { type: String, minlength: 64, maxlength: 64 },
  orderType: { type: String, enum: ['market', 'limit'], default: 'market' },
  limitPrice: { type: Number, min: 0 },
  assetType: { type: String, enum: ['crypto'], default: 'crypto' },
  symbol: { type: String, required: true, uppercase: true },
  side: { type: String, required: true, enum: ['buy', 'sell'] },
  quantity: { type: Number, required: true, min: 0 },
  entryPrice: { type: Number, min: 0 },
  entryAt: { type: Date },
  executionPrice: { type: Number, required: true, min: 0 },
  notional: { type: Number, required: true, min: 0 },
  realizedPnl: { type: Number, required: true, default: 0 },
  cashAfter: { type: Number, required: true, min: 0 },
  portfolioValueAfter: { type: Number, required: true, min: 0 },
  executedAt: { type: Date, required: true }
}, { _id: false });

const processedOrderFingerprintSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  fingerprint: { type: String, required: true }
}, { _id: false });

const pendingOrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  requestFingerprint: { type: String, required: true, minlength: 64, maxlength: 64 },
  symbol: { type: String, required: true, uppercase: true, trim: true },
  side: { type: String, required: true, enum: ['buy', 'sell'] },
  orderType: { type: String, required: true, enum: ['limit'] },
  quantity: { type: Number, required: true, min: 0 },
  limitPrice: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['pending', 'filled', 'cancelled', 'rejected'], default: 'pending' },
  createdAt: { type: Date, required: true },
  updatedAt: { type: Date, required: true },
  filledAt: { type: Date },
  cancelledAt: { type: Date },
  executionPrice: { type: Number },
  rejectionReason: { type: String }
}, { _id: false });

const paperPortfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
  initialBalance: { type: Number, required: true, min: 0, default: 100_000 },
  cash: { type: Number, required: true, min: 0, default: 100_000 },
  realizedPnl: { type: Number, required: true, default: 0 },
  holdings: { type: [holdingSchema], default: [] },
  trades: { type: [tradeSchema], default: [] },
  orders: { type: [pendingOrderSchema], default: [] },
  processedOrderIds: { type: [String], default: [] },
  processedOrderFingerprints: { type: [processedOrderFingerprintSchema], default: [] },
  version: { type: Number, default: 0 },
  resetAt: { type: Date, default: Date.now }
}, { timestamps: true, collection: 'paper_portfolios' });

export default mongoose.models.PaperPortfolio || mongoose.model('PaperPortfolio', paperPortfolioSchema);
