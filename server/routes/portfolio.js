const express = require('express');
const mongoose = require('mongoose');
const Portfolio = require('../models/Portfolio');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
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

router.get('/orders', async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(500);
    res.json({ orders: orders.map((order) => ({
      id: order._id, symbol: order.symbol, side: order.side, qty: order.qty, price: order.price,
      total: order.total, status: order.status, time: order.createdAt.toLocaleTimeString()
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
    const total = qty * price;
    if (!Number.isFinite(total)) return res.status(400).json({ error: 'Order total is too large' });
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        let portfolio = await Portfolio.findOne({ user: req.user._id }).session(session);
        if (!portfolio) [portfolio] = await Portfolio.create([{ user: req.user._id }], { session });
        const holding = portfolio.holdings.find((entry) => entry.symbol === symbol);
        if (type === 'BUY') {
          if (portfolio.balance < total) {
            const error = new Error('Insufficient virtual cash balance');
            error.statusCode = 400;
            throw error;
          }
          portfolio.balance -= total;
          if (holding) {
            const oldCost = holding.qty * holding.avgPrice;
            holding.qty += qty;
            holding.avgPrice = (oldCost + total) / holding.qty;
          } else portfolio.holdings.push({ symbol, qty, avgPrice: price });
        } else {
          if (!holding || holding.qty < qty) {
            const error = new Error('Insufficient holdings to sell');
            error.statusCode = 400;
            throw error;
          }
          portfolio.balance += total;
          holding.qty -= qty;
          if (holding.qty <= 0.000001) portfolio.holdings = portfolio.holdings.filter((entry) => entry.symbol !== symbol);
        }
        await portfolio.save({ session });
        const [order] = await Order.create([{
          user: req.user._id, portfolio: portfolio._id, symbol, side: type, qty, price, total, status: 'FILLED'
        }], { session });
        const [transaction] = await Transaction.create([{
          user: req.user._id, portfolio: portfolio._id, order: order._id, symbol, type, qty, price, total
        }], { session });
        result = { portfolio, order, transaction };
      });
    } finally { await session.endSession(); }
    res.status(201).json({ portfolio: { balance: result.portfolio.balance, holdings: result.portfolio.holdings }, transaction: {
      id: result.transaction._id, symbol, type, qty, price, total, time: result.transaction.createdAt.toLocaleTimeString()
    }, order: { id: result.order._id, status: result.order.status } });
  } catch (error) { next(error); }
});

module.exports = router;
