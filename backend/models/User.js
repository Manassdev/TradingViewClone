import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
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
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  collection: 'users' // explicitly bind to existing collection
});

// Virtual helper to always provide a valid display name
userSchema.virtual('displayName').get(function() {
  return this.name || this.username || this.email.split('@')[0];
});

const User = mongoose.model('User', userSchema);
export default User;
