import { clearPaperOrderIdempotencyKey, getPaperOrderIdempotencyKey } from './paperOrderPreview.js';

export const makeFullHoldingSellOrder = (holding) => {
  const symbol = typeof holding?.symbol === 'string' ? holding.symbol.toUpperCase() : '';
  const quantity = Number(holding?.availableQuantity ?? holding?.quantity);
  if (!/^[A-Z0-9]{2,18}USDT$/.test(symbol) || !Number.isFinite(quantity) || quantity <= 0) return null;
  const preciseQuantity = Number(quantity.toFixed(8));
  return preciseQuantity > 0 ? { symbol, side: 'sell', quantity: preciseQuantity } : null;
};

export const submitFullHoldingSell = async ({
  holding,
  lockRef,
  pendingOrderRef,
  submitOrder,
  refreshPortfolio,
  onStart,
  onPortfolio,
  onSuccess,
  onFailure,
  onRefreshFailure,
  onFinish
}) => {
  const order = makeFullHoldingSellOrder(holding);
  if (!order || !lockRef || lockRef.current) return { status: 'ignored' };

  lockRef.current = true;
  onStart?.(order);
  try {
    const response = await submitOrder(order, getPaperOrderIdempotencyKey(order, pendingOrderRef));
    clearPaperOrderIdempotencyKey(order, pendingOrderRef);
    if (response?.data) onPortfolio?.(response.data);
    onSuccess?.(response);

    try {
      const refreshed = await refreshPortfolio();
      if (refreshed?.data) onPortfolio?.(refreshed.data);
      return { status: 'success', response, refreshed: true };
    } catch (error) {
      onRefreshFailure?.(error, response);
      return { status: 'success-refresh-failed', response, error };
    }
  } catch (error) {
    onFailure?.(error);
    return { status: 'failed', error };
  } finally {
    lockRef.current = false;
    onFinish?.();
  }
};
