import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const getStoredUser = () => {
  if (!localStorage.getItem('tv_token')) return null;
  try { return JSON.parse(localStorage.getItem('tv_user') || 'null'); } catch { return null; }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('tv_token')));

  useEffect(() => {
    if (!localStorage.getItem('tv_token')) {
      localStorage.removeItem('tv_user');
      setUser(null);
      return;
    }
    let active = true;
    api.me().then((result) => {
      if (!active) return;
      setUser(result.user);
      localStorage.setItem('tv_user', JSON.stringify(result.user));
    }).catch(() => {
      if (!active) return;
      localStorage.removeItem('tv_token');
      localStorage.removeItem('tv_user');
      setUser(null);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    async login(email, password) {
      const result = await api.login(email, password);
      localStorage.setItem('tv_token', result.token);
      localStorage.setItem('tv_user', JSON.stringify(result.user));
      setUser(result.user);
      return result;
    },
    async register(name, email, password) {
      const result = await api.register(name, email, password);
      localStorage.setItem('tv_token', result.token);
      localStorage.setItem('tv_user', JSON.stringify(result.user));
      setUser(result.user);
      return result;
    },
    async logout() {
      try { await api.logout(); } finally {
        localStorage.removeItem('tv_token');
        localStorage.removeItem('tv_user');
        setUser(null);
      }
    }
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
