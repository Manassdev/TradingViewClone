import mongoose from 'mongoose';
import LegacyWatchlist from '../models/Watchlist.js';
import NamedWatchlist from '../models/NamedWatchlist.js';
import User from '../models/User.js';
import { getForexPair } from '../services/forexRegistry.js';
import { getIndiaInstrument } from '../services/indiaRegistry.js';

const DEFAULT_LIST = 'My Watchlist';
const symbolPattern = /^[A-Z0-9][A-Z0-9._&-]{0,29}$/;

const serializeList = (list) => ({
  _id: String(list._id),
  name: list.name,
  items: list.items.map((item) => ({
    _id: String(item._id),
    symbol: item.symbol,
    assetType: item.assetType,
    exchange: item.exchange,
    provider: item.provider,
    providerSymbol: item.providerSymbol,
    displayName: item.displayName || item.symbol,
    createdAt: item.createdAt
  })),
  createdAt: list.createdAt,
  updatedAt: list.updatedAt
});

const ownerId = (userId) => new mongoose.Types.ObjectId(userId);
const findOwnedList = (userId, listId) => NamedWatchlist.findOne({ _id: listId, owner: ownerId(userId) });

const collectLegacyItems = async (userId) => {
  const stringId = String(userId);
  const ids = [stringId];
  if (mongoose.Types.ObjectId.isValid(stringId)) ids.push(new mongoose.Types.ObjectId(stringId));
  const docs = await LegacyWatchlist.find({
    $or: [
      ...(mongoose.Types.ObjectId.isValid(stringId) ? [{ user: new mongoose.Types.ObjectId(stringId) }] : []),
      { userId: { $in: ids } }
    ]
  }).sort({ _id: 1 }).lean();
  const items = new Map();
  for (const doc of docs) {
    const candidates = [
      ...(Array.isArray(doc.symbols) ? doc.symbols.map((symbol) => ({ symbol })) : []),
      ...(doc.symbol ? [doc] : [])
    ];
    for (const candidate of candidates) {
      const symbol = String(candidate.symbol || '').trim().toUpperCase();
      if (!symbolPattern.test(symbol)) continue;
      const assetType = candidate.assetType || (symbol.endsWith('USDT') ? 'crypto' : 'stock');
      const key = `${assetType}:${symbol}`;
      if (!items.has(key)) items.set(key, {
        symbol,
        assetType,
        exchange: candidate.exchange || (assetType === 'crypto' ? 'BINANCE' : 'UNKNOWN'),
        provider: candidate.provider || (assetType === 'crypto' ? 'binance' : 'manual'),
        displayName: candidate.displayName || symbol
      });
    }
  }
  return [...items.values()];
};

export const ensureDefaultWatchlist = async (userId, initialItems = []) => {
  const owner = ownerId(userId);
  const user = await User.findById(owner).select('+watchlistsInitialized');
  let list = await NamedWatchlist.findOne({ owner, name: DEFAULT_LIST }).collation({ locale: 'en', strength: 2 });
  if (list) {
    if (user && !user.watchlistsInitialized) {
      user.watchlistsInitialized = true;
      await user.save();
    }
    return list;
  }
  if (user?.watchlistsInitialized && !initialItems.length) return null;

  await NamedWatchlist.init();
  const imported = initialItems.length ? initialItems : await collectLegacyItems(userId);
  try {
    list = await NamedWatchlist.create({ owner, name: DEFAULT_LIST, items: imported });
    if (user) {
      user.watchlistsInitialized = true;
      await user.save();
    }
    return list;
  } catch (error) {
    if (error.code !== 11000) throw error;
    list = await NamedWatchlist.findOne({ owner, name: DEFAULT_LIST }).collation({ locale: 'en', strength: 2 });
    if (user && !user.watchlistsInitialized) {
      user.watchlistsInitialized = true;
      await user.save();
    }
    return list;
  }
};

const resolveList = async (userId, listId) => {
  if (!listId) return ensureDefaultWatchlist(userId);
  if (!mongoose.Types.ObjectId.isValid(listId)) return null;
  return findOwnedList(userId, listId);
};

export const getWatchlist = async (req, res, next) => {
  try {
    const list = await resolveList(req.user.id, req.query.listId);
    if (!list) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    const data = serializeList(list);
    return res.json({ success: true, data: { ...data, symbols: data.items.map((item) => item.symbol) } });
  } catch (error) { return next(error); }
};

export const getWatchlists = async (req, res, next) => {
  try {
    await ensureDefaultWatchlist(req.user.id);
    const lists = await NamedWatchlist.find({ owner: ownerId(req.user.id) }).sort({ createdAt: 1, _id: 1 }).lean();
    return res.json({ success: true, data: lists.map(serializeList) });
  } catch (error) { return next(error); }
};

export const createWatchlist = async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 60) return res.status(400).json({ success: false, message: 'Watchlist name must contain 1–60 characters.' });
    await NamedWatchlist.init();
    const count = await NamedWatchlist.countDocuments({ owner: ownerId(req.user.id) });
    if (count >= 20) return res.status(409).json({ success: false, message: 'An account can have at most 20 watchlists.' });
    const list = await NamedWatchlist.create({ owner: ownerId(req.user.id), name });
    return res.status(201).json({ success: true, data: serializeList(list) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A watchlist with that name already exists.' });
    return next(error);
  }
};

export const renameWatchlist = async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 60) return res.status(400).json({ success: false, message: 'Watchlist name must contain 1–60 characters.' });
    const list = await findOwnedList(req.user.id, req.params.id);
    if (!list) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    list.name = name;
    await list.save();
    return res.json({ success: true, data: serializeList(list) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A watchlist with that name already exists.' });
    return next(error);
  }
};

export const deleteWatchlist = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Watchlist ID is invalid.' });
    const deleted = await NamedWatchlist.findOneAndDelete({ _id: req.params.id, owner: ownerId(req.user.id) });
    if (!deleted) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    return res.json({ success: true, message: 'Watchlist deleted.' });
  } catch (error) { return next(error); }
};

export const addToWatchlist = async (req, res, next) => {
  try {
    let symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '';
    const assetType = req.body?.assetType ?? (symbol.endsWith('USDT') ? 'crypto' : 'stock');
    if (!['stock', 'crypto', 'forex', 'india_stock', 'india_index'].includes(assetType)) return res.status(400).json({ success: false, message: 'assetType must be stock, crypto, forex, india_stock, or india_index.' });
    const forexPair = assetType === 'forex' ? getForexPair(symbol) : null;
    const indiaInstrument = assetType.startsWith('india_') ? getIndiaInstrument(req.body?.exchange, symbol) : null;
    if (assetType === 'forex') {
      if (!forexPair) return res.status(400).json({ success: false, message: 'Forex symbol must be a supported currency pair.' });
      symbol = forexPair.symbol;
    } else if (assetType.startsWith('india_')) {
      if (!indiaInstrument || indiaInstrument.assetType !== assetType) return res.status(400).json({ success: false, message: 'Choose a registered Indian symbol and its exact exchange.' });
      symbol = indiaInstrument.symbol;
    } else if (!symbolPattern.test(symbol)) {
      return res.status(400).json({ success: false, message: 'Enter a valid symbol containing up to 30 letters, numbers, dots, underscores, ampersands, or hyphens.' });
    }
    const list = await resolveList(req.user.id, req.body?.listId);
    if (!list) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    if (list.items.some((item) => item.symbol === symbol && item.assetType === assetType && (!assetType.startsWith('india_') || item.exchange === indiaInstrument.exchange))) return res.status(409).json({ success: false, message: 'This asset is already in the watchlist.' });
    if (list.items.length >= 100) return res.status(409).json({ success: false, message: 'A watchlist can contain at most 100 assets.' });

    const exchange = indiaInstrument?.exchange || (typeof req.body?.exchange === 'string' ? req.body.exchange.trim().toUpperCase() : (assetType === 'crypto' ? 'BINANCE' : assetType === 'forex' ? 'FX' : 'UNKNOWN'));
    if (exchange.length > 20 || (exchange && !/^[A-Z0-9._-]{2,20}$/.test(exchange))) return res.status(400).json({ success: false, message: 'Exchange must contain 2–20 letters, numbers, dots, underscores, or hyphens.' });
    const provider = indiaInstrument ? 'twelvedata' : (typeof req.body?.provider === 'string' && req.body.provider.trim() ? req.body.provider.trim().toLowerCase() : (assetType === 'crypto' ? 'binance' : assetType === 'forex' ? 'twelvedata' : 'manual'));
    const displayName = indiaInstrument?.name || (typeof req.body?.displayName === 'string' && req.body.displayName.trim() ? req.body.displayName.trim().slice(0, 100) : (forexPair?.pair || symbol));
    list.items.push({ symbol, assetType, exchange, provider, providerSymbol: indiaInstrument?.providerSymbol, displayName });
    await list.save();
    const item = list.items.at(-1);
    return res.status(201).json({ success: true, message: 'Asset added to watchlist.', data: { _id: String(item._id), symbol, assetType, exchange, provider, providerSymbol: item.providerSymbol, displayName, createdAt: item.createdAt } });
  } catch (error) { return next(error); }
};

export const removeFromWatchlist = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Watchlist item ID is invalid.' });
    const list = await resolveList(req.user.id, req.query.listId);
    if (!list) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    const item = list.items.id(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Watchlist item not found.' });
    item.deleteOne();
    await list.save();
    return res.json({ success: true, message: 'Asset removed from watchlist.' });
  } catch (error) { return next(error); }
};

export const reorderWatchlist = async (req, res, next) => {
  try {
    const { itemIds } = req.body || {};
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !Array.isArray(itemIds)) return res.status(400).json({ success: false, message: 'Provide a valid watchlist ID and ordered item IDs.' });
    const list = await findOwnedList(req.user.id, req.params.id);
    if (!list) return res.status(404).json({ success: false, message: 'Watchlist not found.' });
    const current = new Map(list.items.map((item) => [String(item._id), item]));
    if (itemIds.length !== current.size || new Set(itemIds).size !== current.size || itemIds.some((id) => !current.has(id))) {
      return res.status(400).json({ success: false, message: 'Ordered item IDs must match every item in the watchlist exactly once.' });
    }
    list.items = itemIds.map((id) => current.get(id));
    await list.save();
    return res.json({ success: true, data: serializeList(list) });
  } catch (error) { return next(error); }
};
