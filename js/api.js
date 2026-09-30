/**
 * TradingView Clone - Frontend API Client Integration Layer
 * Connects frontend UI to Node.js/Express backend & MongoDB Atlas / local instance
 * With graceful offline localStorage fallbacks to guarantee uninterrupted user experience.
 */

window.ApiClient = (function() {
  const API_BASE = 'http://localhost:5000/api';

  const getToken = () => localStorage.getItem('tv_token');
  const setToken = (token) => localStorage.setItem('tv_token', token);
  const clearToken = () => localStorage.removeItem('tv_token');

  const headers = (isAuth = false) => {
    const h = { 'Content-Type': 'application/json' };
    if (isAuth) {
      const token = getToken();
      if (token) h['Authorization'] = `Bearer ${token}`;
    }
    return h;
  };

  const safeFetch = async (url, options = {}) => {
    try {
      const res = await fetch(url, options);
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.warn(`[ApiClient] Network request failed for ${url}:`, err.message);
      return { ok: false, status: 0, error: err.message };
    }
  };

  return {
    API_BASE,
    getToken,
    setToken,
    clearToken,

    // Health check
    async checkHealth() {
      return await safeFetch(`${API_BASE}/health`);
    },

    // Authentication
    auth: {
      async register(name, email, password) {
        const res = await safeFetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: headers(false),
          body: JSON.stringify({ name, email, password })
        });
        if (res.ok && res.data && res.data.token) {
          setToken(res.data.token);
          if (res.data.user) {
            localStorage.setItem('tv_user', JSON.stringify(res.data.user));
          }
        }
        return res;
      },

      async login(email, password) {
        const res = await safeFetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: headers(false),
          body: JSON.stringify({ email, password })
        });
        if (res.ok && res.data && res.data.token) {
          setToken(res.data.token);
          if (res.data.user) {
            localStorage.setItem('tv_user', JSON.stringify(res.data.user));
          }
        }
        return res;
      },

      async getMe() {
        return await safeFetch(`${API_BASE}/users/me`, {
          method: 'GET',
          headers: headers(true)
        });
      },

      async logout() {
        const result = await safeFetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: headers(true)
        });
        clearToken();
        localStorage.removeItem('tv_user');
        return result;
      }
    },

    // Watchlist
    watchlist: {
      async get() {
        return await safeFetch(`${API_BASE}/watchlist`, {
          method: 'GET',
          headers: headers(true)
        });
      },

      async add(asset) {
        return await safeFetch(`${API_BASE}/watchlist`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(asset)
        });
      },

      async remove(symbol) {
        return await safeFetch(`${API_BASE}/watchlist/${encodeURIComponent(symbol)}`, {
          method: 'DELETE',
          headers: headers(true)
        });
      }
    },

    // Alerts
    alerts: {
      async get() {
        return await safeFetch(`${API_BASE}/alerts`, {
          method: 'GET',
          headers: headers(true)
        });
      },

      async create(alertData) {
        return await safeFetch(`${API_BASE}/alerts`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(alertData)
        });
      },

      async update(id, updateData) {
        return await safeFetch(`${API_BASE}/alerts/${id}`, {
          method: 'PUT',
          headers: headers(true),
          body: JSON.stringify(updateData)
        });
      },

      async delete(id) {
        return await safeFetch(`${API_BASE}/alerts/${id}`, {
          method: 'DELETE',
          headers: headers(true)
        });
      }
    },

    notifications: {
      async get() {
        return await safeFetch(`${API_BASE}/notifications`, { method: 'GET', headers: headers(true) });
      },
      async markRead(id) {
        return await safeFetch(`${API_BASE}/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH', headers: headers(true) });
      },
      async markAllRead() {
        return await safeFetch(`${API_BASE}/notifications/read-all`, { method: 'PATCH', headers: headers(true) });
      },
      async delete(id) {
        return await safeFetch(`${API_BASE}/notifications/${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers(true) });
      }
    },

    // Comments
    comments: {
      async getByIdea(ideaId) {
        return await safeFetch(`${API_BASE}/comments/${ideaId}`, {
          method: 'GET',
          headers: headers(false)
        });
      },

      async create(commentData) {
        return await safeFetch(`${API_BASE}/comments`, {
          method: 'POST',
          headers: headers(true),
          body: JSON.stringify(commentData)
        });
      },

      async delete(id) {
        return await safeFetch(`${API_BASE}/comments/${id}`, {
          method: 'DELETE',
          headers: headers(true)
        });
      }
    }
  };
})();
