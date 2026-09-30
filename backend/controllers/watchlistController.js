import mongoose from 'mongoose';
import Watchlist from '../models/Watchlist.js';

const userIdsFor = (userId) => {
  const ids = [String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) {
    ids.push(new mongoose.Types.ObjectId(userId));
  }
  return ids;
};

const identityKey = (item) => `${item.assetType}:${item.symbol}`;

const normalizeLegacySymbol = (symbol, documentId) => {
  const normalized = String(symbol).trim().toUpperCase();
  const assetType = normalized.endsWith('USDT') ? 'crypto' : 'stock';
  return {
    _id: `legacy:${documentId}:${Buffer.from(normalized).toString('base64url')}`,
    symbol: normalized,
    assetType,
    // A legacy stock's exchange was not stored, so do not claim it was NSE.
    exchange: assetType === 'crypto' ? 'BINANCE' : 'UNKNOWN',
    provider: assetType === 'crypto' ? 'binance' : 'unknown',
    displayName: normalized,
    createdAt: null
  };
};

const listUserAssets = async (userId) => {
  const docs = await Watchlist.find({ userId: { $in: userIdsFor(userId) } })
    .sort({ _id: 1 })
    .lean();
  const assets = new Map();

  for (const doc of docs) {
    if (Array.isArray(doc.symbols)) {
      for (const symbol of doc.symbols) {
        const item = normalizeLegacySymbol(symbol, doc._id);
        if (!assets.has(identityKey(item))) assets.set(identityKey(item), item);
      }
    }
    if (doc.symbol && doc.assetType) {
      const item = {
        _id: String(doc._id),
        symbol: doc.symbol,
        assetType: doc.assetType,
        exchange: doc.exchange,
        provider: doc.provider,
        displayName: doc.displayName || doc.symbol,
        createdAt: doc.createdAt || null
      };
      if (!assets.has(identityKey(item))) assets.set(identityKey(item), item);
    }
  }

  return [...assets.values()];
};

const sendWatchlistError = (res, operation, error) => {
  console.error(`[Watchlist] ${operation} failed:`, error.message);
  return res.status(500).json({ success: false, message: 'Unable to process the watchlist request.' });
};

// @route GET /api/watchlist (authenticated)
export const getWatchlist = async (req, res) => {
  try {
    const items = await listUserAssets(req.user.id);
    return res.json({
      success: true,
      data: {
        items,
        // Retain the symbols property for clients built against the legacy API.
        symbols: items.map((item) => item.symbol)
      },
      symbols: items.map((item) => item.symbol)
    });
  } catch (error) {
    return sendWatchlistError(res, 'read', error);
  }
};

// @route POST /api/watchlist (authenticated)
export const addToWatchlist = async (req, res) => {
  try {
    const rawSymbol = req.body?.symbol;
    if (typeof rawSymbol !== 'string' || !rawSymbol.trim()) {
      return res.status(400).json({ success: false, message: 'A valid symbol is required.' });
    }

    const symbol = rawSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._&-]{0,29}$/.test(symbol)) {
      return res.status(400).json({ success: false, message: 'Symbol contains unsupported characters.' });
    }

    // Infer legacy clients' asset type while allowing explicit stock/crypto types.
    const assetType = req.body.assetType === undefined
      ? (symbol.endsWith('USDT') ? 'crypto' : 'stock')
      : req.body.assetType;
    if (!['stock', 'crypto'].includes(assetType)) {
      return res.status(400).json({ success: false, message: 'assetType must be "stock" or "crypto".' });
    }

    const defaultExchange = assetType === 'crypto' ? 'BINANCE' : 'NSE';
    const exchange = typeof req.body.exchange === 'string'
      ? req.body.exchange.trim().toUpperCase()
      : defaultExchange;
    if (!/^[A-Z0-9._-]{2,20}$/.test(exchange)) {
      return res.status(400).json({ success: false, message: 'A valid exchange is required.' });
    }

    const provider = typeof req.body.provider === 'string' && req.body.provider.trim()
      ? req.body.provider.trim().toLowerCase()
      : (assetType === 'crypto' ? 'binance' : 'manual');
    if (provider.length > 40) {
      return res.status(400).json({ success: false, message: 'Provider must be 40 characters or fewer.' });
    }

    const displayName = typeof req.body.displayName === 'string' && req.body.displayName.trim()
      ? req.body.displayName.trim().slice(0, 100)
      : symbol;

    const currentItems = await listUserAssets(req.user.id);
    if (currentItems.some((item) => item.assetType === assetType && item.symbol === symbol)) {
      return res.status(409).json({ success: false, message: 'This asset is already in your watchlist.' });
    }

    // Build the unique partial index before the write to make concurrent adds safe.
    await Watchlist.init();
    const item = await Watchlist.create({
      userId: req.user.id,
      symbol,
      assetType,
      exchange,
      provider,
      displayName,
      createdAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Asset added to watchlist.',
      data: {
        _id: String(item._id),
        symbol: item.symbol,
        assetType: item.assetType,
        exchange: item.exchange,
        provider: item.provider,
        displayName: item.displayName,
        createdAt: item.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'This asset is already in your watchlist.' });
    }
    return sendWatchlistError(res, 'add', error);
  }
};

// @route DELETE /api/watchlist/:id (authenticated)
export const removeFromWatchlist = async (req, res) => {
  try {
    const id = req.params.id;
    const userIds = userIdsFor(req.user.id);

    if (id.startsWith('legacy:')) {
      const [, legacyDocumentId, encodedSymbol] = id.split(':');
      if (!mongoose.Types.ObjectId.isValid(legacyDocumentId) || !encodedSymbol) {
        return res.status(400).json({ success: false, message: 'Watchlist item ID is invalid.' });
      }
      const legacyDocument = await Watchlist.findOne({ _id: legacyDocumentId, userId: { $in: userIds }, symbols: { $exists: true } }).select('_id');
      if (!legacyDocument) {
        return res.status(404).json({ success: false, message: 'Watchlist item not found.' });
      }
      const symbol = Buffer.from(encodedSymbol, 'base64url').toString('utf8');
      const result = await Watchlist.updateMany(
        { userId: { $in: userIds }, symbols: symbol },
        { $pull: { symbols: symbol }, $set: { updatedAt: new Date() } }
      );
      if (!result.modifiedCount) {
        return res.status(404).json({ success: false, message: 'Watchlist item not found.' });
      }
      return res.json({ success: true, message: 'Asset removed from watchlist.' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Watchlist item ID is invalid.' });
    }

    const removed = await Watchlist.findOneAndDelete({ _id: id, userId: { $in: userIds }, symbol: { $type: 'string' } });
    if (!removed) {
      return res.status(404).json({ success: false, message: 'Watchlist item not found.' });
    }
    return res.json({ success: true, message: 'Asset removed from watchlist.' });
  } catch (error) {
    return sendWatchlistError(res, 'delete', error);
  }
};
