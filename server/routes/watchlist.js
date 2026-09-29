const express = require('express');
const Watchlist = require('../models/Watchlist');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const validSymbols = (values) => Array.isArray(values) && values.length <= 100 && values.every((value) => typeof value === 'string' && /^[A-Z0-9]{2,20}$/.test(value));

router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try {
    let watchlist = await Watchlist.findOne({ user: req.user._id });
    if (!watchlist) watchlist = await Watchlist.create({ user: req.user._id });
    res.json({ symbols: watchlist.symbols, favorites: watchlist.favorites });
  } catch (error) { next(error); }
});

router.put('/', async (req, res, next) => {
  try {
    const { symbols, favorites } = req.body;
    if (!validSymbols(symbols) || !validSymbols(favorites)) return res.status(400).json({ error: 'Symbols and favorites must be valid arrays of at most 100 tickers' });
    const update = {
      symbols: [...new Set(symbols.map((value) => value.toUpperCase()))],
      favorites: [...new Set(favorites.map((value) => value.toUpperCase()))]
    };
    const watchlist = await Watchlist.findOneAndUpdate(
      { user: req.user._id }, { $set: update }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    res.json({ symbols: watchlist.symbols, favorites: watchlist.favorites });
  } catch (error) { next(error); }
});

module.exports = router;
