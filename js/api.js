/* Same-origin API client for account data. Binance traffic keeps its existing URLs. */
(function () {
  const tokenKey = 'tv_access_token';

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = sessionStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`/api${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) sessionStorage.removeItem(tokenKey);
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  window.TradingApi = {
    request,
    setSession(token) { sessionStorage.setItem(tokenKey, token); },
    clearSession() { sessionStorage.removeItem(tokenKey); },
    getToken() { return sessionStorage.getItem(tokenKey); },
    signup: (payload) => request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
    login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
    me: () => request('/auth/me'),
    updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
    updatePassword: (payload) => request('/auth/password', { method: 'PATCH', body: JSON.stringify(payload) }),
    getWatchlist: () => request('/watchlist'),
    saveWatchlist: (payload) => request('/watchlist', { method: 'PUT', body: JSON.stringify(payload) }),
    getAlerts: () => request('/alerts'),
    createAlert: (payload) => request('/alerts', { method: 'POST', body: JSON.stringify(payload) }),
    deleteAlert: (id) => request(`/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getPortfolio: () => request('/portfolio'),
    placeOrder: (payload) => request('/portfolio/orders', { method: 'POST', body: JSON.stringify(payload) })
  };
})();
