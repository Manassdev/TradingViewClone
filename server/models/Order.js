const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  portfolio: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true },
  symbol: { type: String, required: true, uppercase: true, match: /^[A-Z0-9]{2,20}$/ },
  side: { type: String, required: true, enum: ['BUY', 'SELL'] },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  status: { type: String, required: true, enum: ['FILLED'], default: 'FILLED' }
}, { timestamps: true, collection: 'orders' });

orderSchema.index({ user: 1, createdAt: -1 });
module.exports = mongoose.model('Order', orderSchema, 'orders');
