const MAX_QUOTE_AMOUNT = 1_000_000_000;
const MAX_ASSET_QUANTITY = 1_000_000;
export const PAPER_QUOTE_MAX_AGE_MS = 45_000;
export const DEFAULT_PAPER_ORDER = Object.freeze({ mode: 'quote', input: '100.00' });
const PREVIEW_SCALE = 100_000_000n;

export const isPaperQuoteFresh = (quote, now = Date.now()) => {
  const timestamp = quote?.updatedAt instanceof Date
    ? quote.updatedAt.getTime()
    : Date.parse(quote?.updatedAt);
  return Number.isFinite(timestamp) && timestamp <= now + 5_000 && now - timestamp <= PAPER_QUOTE_MAX_AGE_MS;
};

export const getPaperOrderIdempotencyKey = (order, pendingRef, createId = () => crypto.randomUUID()) => {
  const signature = JSON.stringify({
    symbol: order?.symbol,
    side: order?.side,
    orderType: order?.orderType || 'market',
    limitPrice: order?.limitPrice ?? null,
    amountUsdt: order?.amountUsdt ?? null,
    quantity: order?.quantity ?? null
  });
  if (!(pendingRef.current instanceof Map)) pendingRef.current = new Map();
  if (!pendingRef.current.has(signature)) {
    let key = null;
    try { key = globalThis.sessionStorage?.getItem(`tv_pending_paper_order:${signature}`) || null; } catch { /* Storage may be disabled. */ }
    if (!key) {
      key = createId();
      try { globalThis.sessionStorage?.setItem(`tv_pending_paper_order:${signature}`, key); } catch { /* In-memory retry remains available. */ }
    }
    pendingRef.current.set(signature, key);
  }
  return pendingRef.current.get(signature);
};

export const clearPaperOrderIdempotencyKey = (order, pendingRef) => {
  const signature = JSON.stringify({
    symbol: order?.symbol,
    side: order?.side,
    orderType: order?.orderType || 'market',
    limitPrice: order?.limitPrice ?? null,
    amountUsdt: order?.amountUsdt ?? null,
    quantity: order?.quantity ?? null
  });
  pendingRef.current?.delete?.(signature);
  try { globalThis.sessionStorage?.removeItem(`tv_pending_paper_order:${signature}`); } catch { /* Ignore unavailable storage. */ }
};

const previewUnits = (value, digits = 8) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const negative = numeric < 0;
  const units = BigInt(Math.abs(numeric).toFixed(digits).replace('.', ''));
  return negative ? -units : units;
};

const previewNumber = (units) => Number(units) / Number(PREVIEW_SCALE);
const roundDivide = (numerator, denominator) => (numerator + denominator / 2n) / denominator;

export const parsePaperOrderInput = (mode, input) => {
  if (typeof input !== 'string' || input.trim() === '') return null;
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (mode === 'quote') {
    if (value > MAX_QUOTE_AMOUNT || Number(value.toFixed(2)) !== value) return null;
  } else if (mode === 'quantity') {
    if (value > MAX_ASSET_QUANTITY || Number(value.toFixed(8)) !== value) return null;
  } else return null;

  return value;
};

export const getPaperOrderInputMessage = (mode, input) => {
  if (typeof input !== 'string' || input.trim() === '') return 'Enter an amount';
  return parsePaperOrderInput(mode, input) === null ? 'Enter a valid amount' : '';
};

export const getPaperOrderPreview = ({ mode, input, quote, symbol }) => {
  const value = parsePaperOrderInput(mode, input);
  const price = Number(quote?.price);
  if (value === null || quote?.symbol !== symbol || !isPaperQuoteFresh(quote) || !Number.isFinite(price) || price <= 0) return null;

  const priceUnits = previewUnits(price);
  const valueUnits = previewUnits(value);
  if (priceUnits === null || priceUnits <= 0n || valueUnits === null || valueUnits <= 0n) return null;

  if (mode === 'quote') {
    let quantityUnits = (valueUnits * PREVIEW_SCALE) / priceUnits;
    if (quantityUnits <= 0n) return null;
    let notionalUnits = roundDivide(quantityUnits * priceUnits, PREVIEW_SCALE);
    if (notionalUnits > valueUnits) {
      quantityUnits -= 1n;
      notionalUnits = roundDivide(quantityUnits * priceUnits, PREVIEW_SCALE);
    }
    if (quantityUnits <= 0n || notionalUnits > valueUnits) return null;
    return { value: previewNumber(notionalUnits), quantity: previewNumber(quantityUnits), valueUnits: notionalUnits, quantityUnits };
  }
  const notionalUnits = roundDivide(valueUnits * priceUnits, PREVIEW_SCALE);
  return { value: previewNumber(notionalUnits), quantity: previewNumber(valueUnits), valueUnits: notionalUnits, quantityUnits: valueUnits };
};

export const getPaperOrderExecutionQuantity = ({ mode, input, quote, symbol }) => {
  const preview = getPaperOrderPreview({ mode, input, quote, symbol });
  if (!preview) return null;
  return preview.quantity;
};

export const canSubmitPaperOrder = ({ mode, input, quote, symbol, side, availableCash, holdingQuantity, busy = false }) => {
  if (busy || !getPaperOrderPreview({ mode, input, quote, symbol })) return false;
  const preview = getPaperOrderPreview({ mode, input, quote, symbol });
  if (side === 'buy') return Number.isFinite(availableCash) && preview.value <= availableCash;
  if (side === 'sell') {
    const quantity = getPaperOrderExecutionQuantity({ mode, input, quote, symbol });
    return Number.isFinite(holdingQuantity) && quantity > 0 && holdingQuantity + 1e-12 >= quantity;
  }
  return false;
};

export const getPaperOrderModeInput = ({ mode, nextMode, input, quote, symbol }) => {
  if (mode === nextMode) return input;
  const preview = getPaperOrderPreview({ mode, input, quote, symbol });
  if (!preview) return '';
  if (nextMode === 'quantity') return String(preview.quantity);
  if (nextMode === 'quote') return String(Number(preview.valueUnits / 1_000_000n) / 100);
  return '';
};
