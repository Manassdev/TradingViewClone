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
  triggerCondition: {
    type: String,
    required: true,
    enum: ['greater_than', 'less_than', 'above', 'below', 'crosses', 'crosses_up', 'crosses_down'],
    default: 'greater_than'
  },
  targetValue: {
    type: Number,
    required: true
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

const Alert = mongoose.model('Alert', alertSchema);
export default Alert;
