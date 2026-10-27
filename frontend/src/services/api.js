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
  ideas: () => request('/market/ideas'),
  news: (category = 'all', signal) => request(`/news?category=${encodeURIComponent(category)}`, { signal }),
  klines: (symbol, interval = '1h', limit = 300, signal) => request(`/market/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`, { signal }),
  ticker: (symbols, signal) => request(`/market/ticker?symbols=${encodeURIComponent(JSON.stringify(symbols))}`, { signal }),
  watchlist: () => request('/watchlist'),
  addToWatchlist: (asset) => request('/watchlist', { method: 'POST', body: JSON.stringify(asset) }),
  removeFromWatchlist: (id) => request(`/watchlist/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  alerts: () => request('/alerts'),
  createAlert: (data) => request('/alerts', { method: 'POST', body: JSON.stringify(data) }),
  paperPortfolio: () => request('/paper-trading'),
  paperPerformance: () => request('/paper-trading/performance'),
  paperOrder: (order, idempotencyKey) => request('/paper-trading/orders', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(order) }),
  resetPaperPortfolio: () => request('/paper-trading/reset', { method: 'POST', body: JSON.stringify({ confirm: 'RESET_PAPER_PORTFOLIO' }) }),
  comments: (ideaId) => request(`/comments/${encodeURIComponent(ideaId)}`),
  createComment: (ideaId, content) => request('/comments', { method: 'POST', body: JSON.stringify({ ideaId, content }) })
};
