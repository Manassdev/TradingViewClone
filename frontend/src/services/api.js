const API_ROOT = import.meta.env.VITE_API_BASE || '/api';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('tv_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  request,
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name, email, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  me: () => request('/users/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  ideas: (signal) => request('/market/ideas', { signal }),
  news: (category = 'all', signal) => request(`/news?category=${encodeURIComponent(category)}`, { signal }),
  forexPairs: () => request('/forex/pairs'),
  forexQuotes: (symbols = []) => request(`/forex/quotes${symbols.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : ''}`),
  forexQuote: (symbol) => request(`/forex/quotes/${encodeURIComponent(symbol)}`),
  forexCandles: (symbol, interval = '1h', limit = 300, signal) => request(`/forex/candles/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal }),
  searchForex: (query) => request(`/forex/search?q=${encodeURIComponent(query)}`),
  forexAnalytics: (symbol, period = '1m', compare = '') => request(`/forex/analytics/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}${compare ? `&compare=${encodeURIComponent(compare)}` : ''}`),
  indiaInstruments: (exchange = '') => request(`/india/instruments${exchange ? `?exchange=${encodeURIComponent(exchange)}` : ''}`),
  indiaQuotes: (instruments = [], signal) => request(`/india/quotes${instruments.length ? `?symbols=${encodeURIComponent(instruments.map(({ exchange, symbol }) => `${exchange}:${symbol}`).join(','))}` : ''}`, { signal }),
  indiaQuote: (exchange, symbol) => request(`/india/quotes/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}`),
  indiaCandles: (exchange, symbol, interval = '1D', limit = 180, signal) => request(`/india/candles/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal }),
  indiaIndices: () => request('/india/indices'),
  indiaMarketStatus: () => request('/india/market-status'),
  indiaSearch: (query) => request(`/india/search?q=${encodeURIComponent(query)}`),
  indiaAnalytics: () => request('/india/analytics'),
  klines: (symbol, interval = '1h', limit = 300, signal) => request(`/market/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal }),
  ticker: (symbols, signal) => request(`/market/ticker?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, { signal }),
  watchlist: (listId) => request(`/watchlist${listId ? `?listId=${encodeURIComponent(listId)}` : ''}`),
  watchlists: () => request('/watchlist/lists'),
  createWatchlist: (name) => request('/watchlist/lists', { method: 'POST', body: JSON.stringify({ name }) }),
  renameWatchlist: (id, name) => request(`/watchlist/lists/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteWatchlist: (id) => request(`/watchlist/lists/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  reorderWatchlist: (id, itemIds) => request(`/watchlist/lists/${encodeURIComponent(id)}/reorder`, { method: 'PUT', body: JSON.stringify({ itemIds }) }),
  addToWatchlist: (asset) => request('/watchlist', { method: 'POST', body: JSON.stringify(asset) }),
  removeFromWatchlist: (id, listId) => request(`/watchlist/${encodeURIComponent(id)}${listId ? `?listId=${encodeURIComponent(listId)}` : ''}`, { method: 'DELETE' }),
  alerts: () => request('/alerts'),
  createAlert: (data, idempotencyKey) => request('/alerts', { method: 'POST', headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}, body: JSON.stringify(data) }),
  updateAlert: (id, data) => request(`/alerts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAlert: (id) => request(`/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  paperPortfolio: () => request('/paper-trading'),
  paperPerformance: () => request('/paper-trading/performance'),
  paperOrder: (order, idempotencyKey) => request('/paper-trading/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(order) }),
  cancelPaperOrder: (orderId) => request(`/paper-trading/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' }),
  resetPaperPortfolio: () => request('/paper-trading/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET_PAPER_PORTFOLIO' }) }),
  comments: (ideaId, signal) => request(`/comments/${encodeURIComponent(ideaId)}`, { signal }),
  createComment: (ideaId, content) => request('/comments', { method: 'POST', body: JSON.stringify({ ideaId, content }) }),
  updateComment: (id, content) => request(`/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  deleteComment: (id) => request(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' })
};
