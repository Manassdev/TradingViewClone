const express = require('express');
const Alert = require('../models/Alert');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.get('/', async (req, res, next) => {
  try { res.json({ alerts: await Alert.find({ user: req.user._id, active: true }).sort({ createdAt: -1 }) }); }
  catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.toUpperCase() : '';
    const { condition, target } = req.body;
    if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !['above', 'below'].includes(condition) || !Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ error: 'Symbol, above/below condition, and positive target are required' });
    }
    const alert = await Alert.create({ user: req.user._id, symbol, condition, target });
    res.status(201).json({ alert });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

module.exports = router;
