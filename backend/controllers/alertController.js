import mongoose from 'mongoose';
import Alert from '../models/Alert.js';

const supportedConditions = new Set(['greater_than', 'less_than', 'above', 'below', 'crosses_up', 'crosses_down']);
const validSymbol = (value) => typeof value === 'string' && /^[A-Z0-9][A-Z0-9._&-]{0,29}$/.test(value);

const userIdsFor = (userId) => {
  const ids = [String(userId)];
  if (mongoose.Types.ObjectId.isValid(userId)) ids.push(new mongoose.Types.ObjectId(userId));
  return ids;
};

const validateId = (id) => mongoose.Types.ObjectId.isValid(id);
const normalizeCondition = (condition) => ({ above: 'greater_than', below: 'less_than' }[condition] || condition);

const resolveAsset = (assetType, symbol) => {
  if (assetType === 'stock') return { assetType, exchange: 'NSE', provider: 'unavailable' };
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
        monitoringAvailable: assetType === 'crypto'
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
    const targetValue = typeof rawTarget === 'number'
      ? rawTarget
      : (typeof rawTarget === 'string' && rawTarget.trim() ? Number(rawTarget) : Number.NaN);

    if (!validSymbol(symbol)) return res.status(400).json({ success: false, message: 'A valid symbol is required.' });
    if (!['stock', 'crypto'].includes(assetType)) return res.status(400).json({ success: false, message: 'assetType must be stock or crypto.' });
    if (!supportedConditions.has(condition)) return res.status(400).json({ success: false, message: 'Condition must be greater_than, less_than, crosses_up, or crosses_down.' });
    if (!Number.isFinite(targetValue) || targetValue <= 0) return res.status(400).json({ success: false, message: 'Target price must be a positive number.' });

    const market = resolveAsset(assetType, symbol);
    const alert = await Alert.create({
      userId: req.user.id,
      symbol,
      ...market,
      triggerCondition: condition,
      targetValue,
      isActive: true,
      isTriggered: false,
      triggeredAt: null,
      notificationCreated: false,
      notificationType: ['in-app']
    });
    return res.status(201).json({ success: true, message: 'Alert created successfully.', data: { ...alert.toObject(), monitoringAvailable: assetType === 'crypto' } });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: 'Alert data is invalid.' });
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
    }
    if (isActive !== undefined) alert.isActive = isActive;
    await alert.save();
    const assetType = alert.assetType || (alert.symbol.endsWith('USDT') ? 'crypto' : 'stock');
    return res.json({ success: true, message: 'Alert updated successfully.', data: { ...alert.toObject(), monitoringAvailable: assetType === 'crypto' } });
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
