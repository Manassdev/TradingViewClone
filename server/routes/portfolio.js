const express = require('express');
const Portfolio = require('../models/Portfolio');
const Transaction = require('../models/Transaction');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function getOrCreatePortfolio(userId) {
  let portfolio = await Portfolio.findOne({ user: userId });
  if (!portfolio) portfolio = await Portfolio.create({ user: userId });
  return portfolio;
}

router.get('/', async (req, res, next) => {
  try {
    const portfolio = await getOrCreatePortfolio(req.user._id);
    const transactions = await Transaction.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(500);
    res.json({ portfolio: { balance: portfolio.balance, holdings: portfolio.holdings }, transactions: transactions.map((t) => ({
      id: t._id, symbol: t.symbol, type: t.type, qty: t.qty, price: t.price, total: t.total,
      time: t.createdAt.toLocaleTimeString()
    })) });
  } catch (error) { next(error); }
});

router.post('/orders', async (req, res, next) => {
  try {
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.toUpperCase() : '';
    const type = req.body.type;
    const { qty, price } = req.body;
    if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !['BUY', 'SELL'].includes(type) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0 || qty > 1e12 || price > 1e12) {
      return res.status(400).json({ error: 'Valid symbol, BUY/SELL type, quantity, and price are required' });
    }
    const portfolio = await getOrCreatePortfolio(req.user._id);
    const total = qty * price;
    if (!Number.isFinite(total)) return res.status(400).json({ error: 'Order total is too large' });
    const holding = portfolio.holdings.find((entry) => entry.symbol === symbol);
    if (type === 'BUY') {
      if (portfolio.balance < total) return res.status(400).json({ error: 'Insufficient virtual cash balance' });
      portfolio.balance -= total;
      if (holding) {
        const oldCost = holding.qty * holding.avgPrice;
        holding.qty += qty;
        holding.avgPrice = (oldCost + total) / holding.qty;
      } else portfolio.holdings.push({ symbol, qty, avgPrice: price });
    } else {
      if (!holding || holding.qty < qty) return res.status(400).json({ error: 'Insufficient holdings to sell' });
      portfolio.balance += total;
      holding.qty -= qty;
      if (holding.qty <= 0.000001) portfolio.holdings = portfolio.holdings.filter((entry) => entry.symbol !== symbol);
    }
    await portfolio.save();
    const transaction = await Transaction.create({ user: req.user._id, portfolio: portfolio._id, symbol, type, qty, price, total });
    res.status(201).json({ portfolio: { balance: portfolio.balance, holdings: portfolio.holdings }, transaction: {
      id: transaction._id, symbol, type, qty, price, total, time: transaction.createdAt.toLocaleTimeString()
    } });
  } catch (error) { next(error); }
});

module.exports = router;
