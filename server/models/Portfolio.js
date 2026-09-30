const mongoose = require('mongoose');

const holdingSchema = new mongoose.Schema({
  symbol: { type: String, required: true, uppercase: true, match: /^[A-Z0-9]{2,20}$/ },
  qty: { type: Number, required: true, min: 0 },
  avgPrice: { type: Number, required: true, min: 0 }
}, { _id: false });

const portfolioSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  balance: { type: Number, default: 100000, min: 0 },
  holdings: { type: [holdingSchema], default: [] }
}, { timestamps: true, collection: 'portfolios' });

module.exports = mongoose.model('Portfolio', portfolioSchema);
