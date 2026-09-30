import Alert from '../models/Alert.js';
import Notification from '../models/Notification.js';

const DEFAULT_BINANCE_API_BASE = 'https://api.binance.com';
const DEFAULT_INTERVAL_MS = 30_000;
const previousPrices = new Map();
let intervalHandle = null;
let polling = false;

export const isConditionMet = (condition, target, current, previous) => {
  if (condition === 'greater_than' || condition === 'above') return current >= target;
  if (condition === 'less_than' || condition === 'below') return current <= target;
  if (condition === 'crosses_up') return Number.isFinite(previous) && previous < target && current >= target;
  if (condition === 'crosses_down') return Number.isFinite(previous) && previous > target && current <= target;
  return false;
};

export const getMonitorIntervalMs = () => {
  const configured = Number(process.env.ALERT_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  return Number.isInteger(configured) && configured >= 5_000 ? configured : DEFAULT_INTERVAL_MS;
};

const fetchBinancePrices = async (symbols) => {
  if (!symbols.length) return new Map();
  const binanceApiBase = process.env.BINANCE_API_BASE || DEFAULT_BINANCE_API_BASE;
  // Fetch the public ticker snapshot once; an unsupported requested pair cannot
  // make otherwise valid active pairs fail as a batch.
  const response = await fetch(`${binanceApiBase}/api/v3/ticker/price`, {
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Binance price endpoint returned ${response.status}`);
  const rows = await response.json();
  const requested = new Set(symbols);
  return new Map(rows.filter((row) => requested.has(row.symbol)).map((row) => [row.symbol, Number(row.price)]));
};

const assetTypeFor = (alert) => alert.assetType || (alert.symbol?.endsWith('USDT') ? 'crypto' : 'stock');

const saveNotificationOnce = async (alert, price, assetType) => {
  const formattedPrice = new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(price);
  await Notification.updateOne(
    { alertId: alert._id, triggerCount: alert.triggerCount || 1 },
    {
      $setOnInsert: {
        userId: alert.userId,
        alertId: alert._id,
        triggerCount: alert.triggerCount || 1,
        type: 'price_alert',
        title: 'Price Alert Triggered',
        message: `${alert.symbol} reached ${formattedPrice}`,
        symbol: alert.symbol,
        assetType,
        price,
        isRead: false,
        createdAt: new Date()
      }
    },
    { upsert: true }
  );
  await Alert.updateOne({ _id: alert._id, notificationCreated: { $ne: true } }, { $set: { notificationCreated: true } });
};

const triggerIfMatched = async (alert, price, previous) => {
  const condition = alert.triggerCondition;
  if (!isConditionMet(condition, alert.targetValue, price, previous)) return false;
  const triggeredAt = new Date();
  const claimed = await Alert.findOneAndUpdate(
    { _id: alert._id, isActive: true, isTriggered: { $ne: true } },
    { $set: { isActive: false, isTriggered: true, triggeredAt, triggeredPrice: price, notificationCreated: false }, $inc: { triggerCount: 1 } },
    { new: true }
  ).lean();
  if (!claimed) return false;
  await saveNotificationOnce(claimed, price, assetTypeFor(claimed));
  return true;
};

/** One polling pass; accepts an injectable price source for deterministic tests. */
export const runAlertMonitorOnce = async (priceProvider = fetchBinancePrices, testFilter = {}) => {
  const active = await Alert.find({ ...testFilter, isActive: true, isTriggered: { $ne: true } }).lean();
  const cryptoSymbols = [...new Set(active.filter((alert) => assetTypeFor(alert) === 'crypto').map((alert) => alert.symbol))];
  let prices = new Map();
  if (cryptoSymbols.length) prices = await priceProvider(cryptoSymbols);

  let triggeredCount = 0;
  for (const alert of active) {
    const assetType = assetTypeFor(alert);
    if (assetType !== 'crypto') continue; // No live stock provider is configured.
    const price = Number(prices.get(alert.symbol));
    if (!Number.isFinite(price) || price <= 0) continue;
    const key = `${alert.provider || 'binance'}:${alert.symbol}`;
    const previous = previousPrices.get(key);
    try {
      if (await triggerIfMatched(alert, price, previous)) triggeredCount += 1;
    } catch (error) {
      console.error(`[AlertMonitor] Could not process alert ${alert._id}:`, error.message);
    }
    previousPrices.set(key, price);
  }

  // Reconcile a crash between claiming an alert and writing its notification.
  const pending = await Alert.find({ ...testFilter, isTriggered: true, triggeredAt: { $ne: null }, triggeredPrice: { $type: 'number' }, notificationCreated: { $ne: true } }).lean();
  for (const alert of pending) {
    try {
      await saveNotificationOnce(alert, Number(alert.triggeredPrice ?? alert.targetValue), assetTypeFor(alert));
    } catch (error) {
      console.error(`[AlertMonitor] Could not recover notification for alert ${alert._id}:`, error.message);
    }
  }
  return { checked: active.length, triggered: triggeredCount, cryptoSymbols: cryptoSymbols.length };
};

export const startAlertMonitor = () => {
  if (intervalHandle) return intervalHandle;
  const intervalMs = getMonitorIntervalMs();
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const result = await runAlertMonitorOnce();
      if (result.checked > 0) console.info(`[AlertMonitor] Checked ${result.checked} active alert(s); triggered ${result.triggered}.`);
    } catch (error) {
      console.error('[AlertMonitor] Poll failed:', error.message);
    } finally {
      polling = false;
    }
  };
  intervalHandle = setInterval(poll, intervalMs);
  intervalHandle.unref?.();
  void poll();
  console.info(`[AlertMonitor] Running every ${intervalMs}ms.`);
  return intervalHandle;
};

export const stopAlertMonitor = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};
