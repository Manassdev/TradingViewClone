import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true
  },
  username: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
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
