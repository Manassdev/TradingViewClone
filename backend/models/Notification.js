import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    index: true
  },
  alertId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  triggerCount: {
    type: Number,
    required: true,
    default: 1
  },
  type: {
    type: String,
    required: true,
    enum: ['price_alert']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  symbol: {
    type: String,
    required: true
  },
  assetType: {
    type: String,
    required: true,
    enum: ['stock', 'crypto']
  },
  price: {
    type: Number,
    required: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'notifications'
});

notificationSchema.index({ alertId: 1, triggerCount: 1 }, { unique: true });
notificationSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('Notification', notificationSchema);
