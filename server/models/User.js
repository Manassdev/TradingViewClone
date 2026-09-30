const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false, match: /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
  avatar: { type: String, default: 'user', maxlength: 40 }
}, { timestamps: true, collection: 'users' });

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);
