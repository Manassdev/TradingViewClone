import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  symbol: {
    type: String,
    required: true,
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
  providerSymbol: { type: String, uppercase: true, trim: true },
  idempotencyKey: { type: String, trim: true },
  requestFingerprint: { type: String },
  triggerCondition: {
    type: String,
    required: true,
    enum: ['greater_than', 'less_than', 'above', 'below', 'crosses', 'crosses_up', 'crosses_down'],
    default: 'greater_than'
  },
  targetValue: {
    type: Number,
    required: true,
    min: 0.00000001
  },
  lastEvaluatedPrice: {
    type: Number,
    min: 0
  },
  lastEvaluatedAt: {
    type: Date
  },
  lastProviderUpdatedAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isTriggered: {
    type: Boolean,
    default: false
  },
  triggeredAt: {
    type: Date,
    default: null
  },
  triggeredPrice: {
    type: Number,
    default: null
  },
  notificationCreated: {
    type: Boolean,
    default: false
  },
  triggerCount: {
    type: Number,
    default: 0
  },
  notificationType: {
    type: [String],
    default: ['in-app']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'alerts'
});

alertSchema.index({ userId: 1, createdAt: -1 }, { name: 'alerts_by_owner' });
alertSchema.index({ isActive: 1, assetType: 1, exchange: 1, symbol: 1 }, { name: 'active_alerts_by_market_exchange' });
alertSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } }, name: 'unique_alert_request_per_owner' }
);

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
