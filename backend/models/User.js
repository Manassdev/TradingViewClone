import mongoose from 'mongoose';

const preferencesSchema = new mongoose.Schema({
  theme: { type: String, enum: ['dark', 'light', 'system'], default: 'dark' },
  locale: { type: String, trim: true, maxlength: 20, default: 'en' },
  timezone: { type: String, trim: true, maxlength: 60, default: 'Asia/Kolkata' },
  notifications: {
    priceAlerts: { type: Boolean, default: true },
    community: { type: Boolean, default: true },
    news: { type: Boolean, default: false }
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    maxlength: 100
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  username: {
    type: String,
    required: [true, 'Username is required'],
    trim: true,
    minlength: [3, 'Username must be at least 3 characters long'],
    maxlength: [30, 'Username must be 30 characters or fewer']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 254,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  passwordHash: {
    type: String,
    required: [true, 'Password hash is required'],
    match: /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/,
    select: false
  },
  tokenVersion: {
    type: Number,
    default: 0,
    select: false
  },
  avatar: {
    type: String,
    maxlength: 500,
    default: 'user'
  },
  preferences: { type: preferencesSchema, default: () => ({}) },
  watchlistsInitialized: { type: Boolean, default: false, select: false }
}, {
  timestamps: true,
  collection: 'users' // explicitly bind to existing collection
});

userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 }, name: 'uniq_username_case_insensitive' });

const User = mongoose.model('User', userSchema);
export default User;
