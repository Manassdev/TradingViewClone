const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  avatar: { type: String, default: 'user', maxlength: 40 }
}, { timestamps: true });

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
