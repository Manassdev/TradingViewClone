import mongoose from 'mongoose';
import Alert from '../models/Alert.js';
import { getIndiaInstrument } from '../services/indiaRegistry.js';

const supportedConditions = new Set(['greater_than', 'less_than', 'above', 'below', 'crosses_up', 'crosses_down']);
const validSymbol = (value) => typeof value === 'string' && /^[A-Z0-9][A-Z0-9._&-]{0,29}$/.test(value);

const userIdsFor = (userId) => {
  const ids = [String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) ids.push(new mongoose.Types.ObjectId(userId));
  return ids;
};

const validateId = (id) => mongoose.Types.ObjectId.isValid(id);
const normalizeCondition = (condition) => ({ above: 'greater_than', below: 'less_than' }[condition] || condition);
const alertResponse = (alert, assetType) => ({
  ...alert.toObject(),
  monitoringAvailable: ['crypto', 'india_stock', 'india_index'].includes(assetType),
  evaluationMode: assetType.startsWith('india_') ? 'daily-close EOD' : assetType === 'crypto' ? 'continuous' : 'unavailable'
});
const sendExistingIdempotentAlert = async (res, userId, idempotencyKey, requestFingerprint) => {
  if (!idempotencyKey) return false;
  const existing = await Alert.findOne({ userId, idempotencyKey });
  if (!existing) return false;
  if (existing.requestFingerprint !== requestFingerprint) {
    res.status(409).json({ success: false, message: 'This request key was already used for a different alert.' });
    return true;
  }
  const assetType = existing.assetType || (existing.symbol.endsWith('USDT') ? 'crypto' : 'stock');
  res.status(200).json({ success: true, message: 'Alert was already created.', data: alertResponse(existing, assetType) });
  return true;
};

const resolveAsset = (assetType, symbol, exchange) => {
  if (assetType === 'stock') return { assetType, exchange: 'NSE', provider: 'unavailable' };
  if (assetType.startsWith('india_')) {
    const instrument = getIndiaInstrument(exchange, symbol);
    if (!instrument || instrument.assetType !== assetType) return null;
    return { assetType, exchange: instrument.exchange, provider: 'twelvedata', providerSymbol: instrument.providerSymbol };
  }
  return { assetType: 'crypto', exchange: 'BINANCE', provider: 'binance' };
};

const sendError = (res, operation, error) => {
  console.error(`[Alerts] ${operation} failed:`, error.message);
  return res.status(500).json({ success: false, message: 'Unable to process the alert request.' });
};

export const getAlerts = async (req, res) => {
  try {
    const alerts = await Alert.find({ userId: { $in: userIdsFor(req.user.id) } }).sort({ createdAt: -1 }).lean();
    const data = alerts.map((alert) => {
      const assetType = alert.assetType || (alert.symbol?.endsWith('USDT') ? 'crypto' : 'stock');
      return {
        ...alert,
        assetType,
        provider: alert.provider || (assetType === 'crypto' ? 'binance' : 'unavailable'),
        exchange: alert.exchange || (assetType === 'crypto' ? 'BINANCE' : 'NSE'),
        monitoringAvailable: ['crypto', 'india_stock', 'india_index'].includes(assetType),
        evaluationMode: assetType.startsWith('india_') ? 'daily-close EOD' : assetType === 'crypto' ? 'continuous' : 'unavailable'
      };
    });
    return res.json({ success: true, count: data.length, data });
  } catch (error) {
    return sendError(res, 'list', error);
  }
};

export const createAlert = async (req, res) => {
  try {
    const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '';
    const assetType = req.body?.assetType;
    const condition = normalizeCondition(String(req.body?.condition || req.body?.triggerCondition || '').toLowerCase());
    const rawTarget = req.body?.targetValue ?? req.body?.target;
    const idempotencyKey = req.get('Idempotency-Key')?.trim() || null;
    const targetValue = typeof rawTarget === 'number'
      ? rawTarget
      : (typeof rawTarget === 'string' && rawTarget.trim() ? Number(rawTarget) : Number.NaN);

    if (!validSymbol(symbol)) return res.status(400).json({ success: false, message: 'A valid symbol is required.' });
    if (!['stock', 'crypto', 'india_stock', 'india_index'].includes(assetType)) return res.status(400).json({ success: false, message: 'assetType must be stock, crypto, india_stock, or india_index.' });
    if (!supportedConditions.has(condition)) return res.status(400).json({ success: false, message: 'Condition must be greater_than, less_than, crosses_up, or crosses_down.' });
    if (!Number.isFinite(targetValue) || targetValue <= 0) return res.status(400).json({ success: false, message: 'Target price must be a positive number.' });
    if (idempotencyKey && !/^[A-Za-z0-9_-]{8,128}$/.test(idempotencyKey)) return res.status(400).json({ success: false, message: 'Idempotency-Key must be 8 to 128 URL-safe characters.' });

    const market = resolveAsset(assetType, symbol, req.body?.exchange);
    if (!market) return res.status(400).json({ success: false, message: 'Choose a registered Indian symbol and its exact exchange.' });
    const requestFingerprint = JSON.stringify({ symbol, assetType, condition, targetValue, exchange: market.exchange });
    if (await sendExistingIdempotentAlert(res, req.user.id, idempotencyKey, requestFingerprint)) return;
    const alert = await Alert.create({
      userId: req.user.id,
      symbol,
      ...market,
      ...(idempotencyKey ? { idempotencyKey, requestFingerprint } : {}),
      triggerCondition: condition,
      targetValue,
      isActive: true,
      isTriggered: false,
      triggeredAt: null,
      notificationCreated: false,
      notificationType: ['in-app']
    });
    return res.status(201).json({ success: true, message: 'Alert created successfully.', data: alertResponse(alert, assetType) });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Alert data is invalid.' });
    if (error.code === 11000 && req.get('Idempotency-Key')) {
      try {
        if (await sendExistingIdempotentAlert(res, req.user.id, req.get('Idempotency-Key').trim(), JSON.stringify({
          symbol: typeof req.body?.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : '',
          assetType: req.body?.assetType,
          condition: normalizeCondition(String(req.body?.condition || req.body?.triggerCondition || '').toLowerCase()),
          targetValue: Number(req.body?.targetValue ?? req.body?.target),
          exchange: req.body?.assetType === 'stock' ? 'NSE' : req.body?.assetType === 'crypto' ? 'BINANCE' : String(req.body?.exchange || '').toUpperCase()
        }))) return;
      } catch (lookupError) { return sendError(res, 'idempotency lookup', lookupError); }
    }
    return sendError(res, 'create', error);
  }
};

export const updateAlert = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(id)) return res.status(400).json({ success: false, message: 'Alert ID is invalid.' });
    const alert = await Alert.findOne({ _id: id, userId: { $in: userIdsFor(req.user.id) } });
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });

    const { isActive, targetValue, condition, triggerCondition } = req.body || {};
    if (isActive !== undefined && typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be a boolean.' });
    if (targetValue !== undefined) {
      const value = typeof targetValue === 'number'
        ? targetValue
        : (typeof targetValue === 'string' && targetValue.trim() ? Number(targetValue) : Number.NaN);
      if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ success: false, message: 'Target price must be a positive number.' });
      alert.targetValue = value;
    }
    if (condition !== undefined || triggerCondition !== undefined) {
      const value = normalizeCondition(String(condition ?? triggerCondition).toLowerCase());
      if (!supportedConditions.has(value)) return res.status(400).json({ success: false, message: 'Alert condition is invalid.' });
      alert.triggerCondition = value;
    }
    if (isActive === true && !alert.isActive) {
      alert.isTriggered = false;
      alert.triggeredAt = null;
      alert.notificationCreated = false;
      alert.lastProviderUpdatedAt = null;
    }
    if (isActive !== undefined) alert.isActive = isActive;
    await alert.save();
    const assetType = alert.assetType || (alert.symbol.endsWith('USDT') ? 'crypto' : 'stock');
    return res.json({ success: true, message: 'Alert updated successfully.', data: { ...alert.toObject(), monitoringAvailable: ['crypto', 'india_stock', 'india_index'].includes(assetType), evaluationMode: assetType.startsWith('india_') ? 'daily-close EOD' : assetType === 'crypto' ? 'continuous' : 'unavailable' } });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Alert data is invalid.' });
    return sendError(res, 'update', error);
  }
};

export const deleteAlert = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(id)) return res.status(400).json({ success: false, message: 'Alert ID is invalid.' });
    const deleted = await Alert.findOneAndDelete({ _id: id, userId: { $in: userIdsFor(req.user.id) } });
    if (!deleted) return res.status(404).json({ success: false, message: 'Alert not found.' });
    return res.json({ success: true, message: 'Alert removed successfully.' });
  } catch (error) {
    return sendError(res, 'delete', error);
  }
};
