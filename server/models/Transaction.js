const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  portfolio: { type: mongoose.Schema.Types.ObjectId, ref: 'Portfolio', required: true },
  symbol: { type: String, required: true, uppercase: true, match: /^[A-Z0-9]{2,20}$/ },
  type: { type: String, required: true, enum: ['BUY', 'SELL'] },
  qty: { type: Number, required: true, min: 0 },
  price: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

module.exports = mongoose.model('Transaction', transactionSchema);
