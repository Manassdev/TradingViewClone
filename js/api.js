/* Same-origin API client for account data. Binance traffic keeps its existing URLs. */
(function () {
  const tokenKey = 'tv_access_token';

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = sessionStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(`/api${path}`, { ...options, headers, signal: options.signal || controller.signal });
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
      throw new Error('Could not reach the server. Check that the backend is running and try again.');
    } finally {
      window.clearTimeout(timeoutId);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      if (response.status === 401 && sessionStorage.getItem(tokenKey)) {
        sessionStorage.removeItem(tokenKey);
        window.dispatchEvent(new CustomEvent('trading:auth-expired'));
      }
      throw error;
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
    getOrders: () => request('/portfolio/orders'),
    placeOrder: (payload) => request('/portfolio/orders', { method: 'POST', body: JSON.stringify(payload) })
  };
})();
