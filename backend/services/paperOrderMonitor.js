import PaperPortfolio from '../models/PaperPortfolio.js';
import { evaluatePendingPaperOrders } from './paperTradingService.js';

const DEFAULT_INTERVAL_MS = 15_000;
let intervalHandle = null;
let polling = false;

export const getPaperOrderMonitorIntervalMs = () => {
  const configured = Number(process.env.PAPER_ORDER_CHECK_INTERVAL_MS || DEFAULT_INTERVAL_MS);
  return Number.isInteger(configured) && configured >= 5_000 && configured <= 300_000
    ? configured
    : DEFAULT_INTERVAL_MS;
};

export const runPaperOrderMonitorOnce = async () => {
  const accounts = await PaperPortfolio.find({ orders: { $elemMatch: { status: 'pending' } } })
    .select({ userId: 1 })
    .lean();
  let evaluated = 0;
  for (const account of accounts) {
    try {
      await evaluatePendingPaperOrders(account.userId);
      evaluated += 1;
    } catch (error) {
      console.warn('[PaperOrderMonitor] Evaluation skipped:', error.message);
    }
  }
  return { accounts: accounts.length, evaluated };
};

export const startPaperOrderMonitor = () => {
  if (intervalHandle) return intervalHandle;
  const intervalMs = getPaperOrderMonitorIntervalMs();
  const poll = async () => {
    if (polling) return;
    polling = true;
    try {
      const result = await runPaperOrderMonitorOnce();
      if (result.accounts) console.info(`[PaperOrderMonitor] Evaluated ${result.evaluated}/${result.accounts} account(s).`);
    } catch (error) {
      console.error('[PaperOrderMonitor] Poll failed:', error.message);
    } finally {
      polling = false;
    }
  };
  intervalHandle = setInterval(poll, intervalMs);
  intervalHandle.unref?.();
  void poll();
  console.info(`[PaperOrderMonitor] Running every ${intervalMs}ms.`);
  return intervalHandle;
};

export const stopPaperOrderMonitor = () => {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
};
