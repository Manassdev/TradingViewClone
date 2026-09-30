const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true, uppercase: true, match: /^[A-Z0-9]{2,20}$/ },
  condition: { type: String, required: true, enum: ['above', 'below'] },
  target: { type: Number, required: true, min: 0.00000001 },
  active: { type: Boolean, default: true }
}, { timestamps: true, collection: 'alertss' });

alertSchema.index({ user: 1, active: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema, 'alertss');
