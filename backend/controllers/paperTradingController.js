import {
  executePaperOrder,
  placePaperLimitOrder,
  cancelPaperOrder,
  getPaperPerformance,
  getPaperPortfolio,
  PaperTradingError,
  resetPaperPortfolio
} from '../services/paperTradingService.js';

const handleError = (res, error) => {
  const status = error instanceof PaperTradingError ? error.status : (error.status === 429 ? 503 : 503);
  if (status === 503) res.set('Retry-After', '30');
  return res.status(status).json({ success: false, message: error instanceof PaperTradingError ? error.message : 'Paper trading data is temporarily unavailable.' });
};

export const getPortfolio = async (req, res) => {
  try { return res.json({ success: true, data: await getPaperPortfolio(req.user.id) }); }
  catch (error) { return handleError(res, error); }
};

export const postOrder = async (req, res) => {
  try {
    const { symbol, side, quantity, amountUsdt, orderType, limitPrice } = req.body || {};
    const order = { symbol, side, quantity, amountUsdt, orderType, limitPrice, orderId: req.get('Idempotency-Key') };
    const result = order.orderType === 'limit'
      ? await placePaperLimitOrder(req.user.id, order)
      : await executePaperOrder(req.user.id, order);
    return res.status(result.duplicate ? 200 : 201).json({ success: true, duplicate: result.duplicate, pending: result.pending || result.order?.status === 'pending', data: result.portfolio, trade: result.trade || null, order: result.order || null });
  } catch (error) { return handleError(res, error); }
};

export const deleteOrder = async (req, res) => {
  try { return res.json({ success: true, data: await cancelPaperOrder(req.user.id, req.params.orderId) }); }
  catch (error) { return handleError(res, error); }
};

export const postReset = async (req, res) => {
  if (req.body?.confirm !== 'RESET_PAPER_PORTFOLIO') {
    return res.status(400).json({ success: false, message: 'Confirm the reset before clearing this paper portfolio.' });
  }
  try { return res.json({ success: true, data: await resetPaperPortfolio(req.user.id) }); }
  catch (error) { return handleError(res, error); }
};

export const getPerformance = async (req, res) => {
  try { return res.json({ success: true, data: await getPaperPerformance(req.user.id) }); }
  catch (error) { return handleError(res, error); }
};
