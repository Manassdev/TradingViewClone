import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Watchlist from '../models/Watchlist.js';
import { getJwtSecret } from '../config/env.js';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      name: user.name || user.username || 'User',
      ver: user.tokenVersion || 0
    },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res, next) => {
  try {
    const { name, username, email, password } = req.body;
    const displayName = (name || username || '').trim();

    if (!displayName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields (name/username, email, password)'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await User.findOne({
      $or: [
        { email: cleanEmail },
        ...(displayName ? [{ name: displayName }, { username: displayName }] : [])
      ]
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email or username already exists'
      });
    }

    // Hash password with bcrypt
    const salt = await bcryptjs.genSalt(10);
    const hashedPassword = await bcryptjs.hash(password, salt);

    const newUser = new User({
      name: displayName,
      username: displayName,
      email: cleanEmail,
      password: hashedPassword,
      avatar: 'user'
    });

    const savedUser = await newUser.save();

    // Create an initial default watchlist in the database
    const defaultWatchlist = new Watchlist({
      userId: savedUser._id,
      name: 'My Watchlist',
      symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT']
    });
    await defaultWatchlist.save();

    const token = generateToken(savedUser);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: savedUser._id,
        name: savedUser.name || savedUser.username,
        email: savedUser.email,
        avatar: savedUser.avatar
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email/username and password'
      });
    }

    const query = email.trim();
    const isEmail = query.includes('@');

    // Support login via email or username/name
    const user = await User.findOne(
      isEmail
        ? { email: query.toLowerCase() }
        : { $or: [{ username: query }, { name: query }, { email: query.toLowerCase() }] }
    ).select('+password +tokenVersion');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Only bcrypt hashes are accepted. Legacy records remain intact and require
    // a password reset if their stored value is not a bcrypt hash.
    const isBcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(user.password || '');
    const isMatch = isBcryptHash && await bcryptjs.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name || user.username || 'User',
        email: user.email,
        avatar: user.avatar || 'user'
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Revoke all JWTs issued before logout
// @route   POST /api/auth/logout
// @access  Private
export const logoutUser = async (req, res, next) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
};

// @desc    Get current user profile
// @route   GET /api/users/me
// @access  Private
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name || user.username,
        email: user.email,
        avatar: user.avatar,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
};
