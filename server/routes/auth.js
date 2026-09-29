const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Watchlist = require('../models/Watchlist');
const Portfolio = require('../models/Portfolio');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const safeUser = (user) => ({ id: user._id, username: user.username, email: user.email, avatar: user.avatar });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function issueToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

router.post('/signup', async (req, res, next) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!/^[\p{L}\p{N}_-]{3,30}$/u.test(username)) return res.status(400).json({ error: 'Username must be 3–30 letters, numbers, underscores, or hyphens' });
    if (!emailPattern.test(email) || email.length > 254) return res.status(400).json({ error: 'A valid email is required' });
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Password must be 8–72 UTF-8 bytes' });
    if (await User.exists({ $or: [{ email }, { username }] })) return res.status(409).json({ error: 'Email or username already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email, passwordHash });
    await Promise.all([
      Watchlist.create({ user: user._id }),
      Portfolio.create({ user: user._id })
    ]);
    res.status(201).json({ token: issueToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const login = typeof req.body.login === 'string' ? req.body.login.trim() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (!login || !password || login.length > 254 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Login and password are required' });
    const user = await User.findOne({ $or: [{ email: login.toLowerCase() }, { username: login }] }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: issueToken(user), user: safeUser(user) });
  } catch (error) { next(error); }
});

router.get('/me', requireAuth, async (req, res) => res.json({ user: safeUser(req.user) }));

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { avatar } = req.body;
    if (typeof avatar !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(avatar)) return res.status(400).json({ error: 'Valid avatar is required' });
    req.user.avatar = avatar;
    await req.user.save();
    res.json({ user: safeUser(req.user) });
  } catch (error) { next(error); }
});

router.patch('/password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(currentPassword, 'utf8') > 72 || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({ error: 'Current password and a new password of 8–72 characters are required' });
    }
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(401).json({ error: 'Current password is incorrect' });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (error) { next(error); }
});

module.exports = router;
