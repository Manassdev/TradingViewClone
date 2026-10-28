import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Activity, ArrowDownRight, ArrowUpRight, ChevronDown, CircleUserRound, Globe2, LogOut, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const money = (value, digits = 2) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';

export const formatDate = (value) => {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

export function Sparkline({ data = [], positive = true, className = '', style }) {
  const values = data.map((item) => Number(item.value)).filter(Number.isFinite);
  if (values.length < 2) return <div className={`sparkline-empty ${className}`} aria-label="Chart preview unavailable" />;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${36 - ((value - min) / range) * 30}`).join(' ');
  return <svg className={`sparkline ${className}`} style={style} viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Recent market price chart">
    <polyline points={points} fill="none" stroke={positive ? 'var(--tv-green)' : 'var(--tv-red)'} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function SectionHeading({ eyebrow, title, description, action }) {
  return <div className="section-heading">
    <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description && <p className="section-description">{description}</p>}</div>
    {action}
  </div>;
}

export function LoadingState({ label = 'Loading market data…' }) {
  return <div className="state-card" role="status"><span className="spinner" /><span>{label}</span></div>;
}

export function ErrorState({ message, onRetry }) {
  return <div className="state-card state-error" role="alert"><p>{message}</p>{onRetry && <button className="button button-secondary" onClick={onRetry}>Try again</button>}</div>;
}

export function EmptyState({ title, message, onRefresh, refreshing = false }) {
  return <div className="state-card empty-card"><span className="empty-icon"><Activity size={20} /></span><h3>{title}</h3><p>{message}</p>{onRefresh && <button className="button button-secondary" onClick={onRefresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh ideas'}</button>}</div>;
}

export function MarketStrip() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.ticker(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT']).then((data) => { if (alive && Array.isArray(data)) setRows(data); }).catch(() => {});
    load(); const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return <div className="market-strip"><div className="market-strip-inner">{rows.slice(0, 5).map((row) => {
    const up = Number(row.priceChangePercent) >= 0;
    return <Link className="ticker-pill" to={`/chart/${row.symbol}`} key={row.symbol}><b>{row.symbol?.replace('USDT', '')}</b><span>${money(row.lastPrice)}</span><small className={up ? 'positive' : 'negative'}>{up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{up ? '+' : ''}{money(row.priceChangePercent)}%</small></Link>;
  })}{!rows.length && <span className="ticker-placeholder"><Activity size={13} /> Live crypto market data</span>}</div></div>;
}

export function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [indiaResults, setIndiaResults] = useState([]);
  const [forexResults, setForexResults] = useState([]);
  const [signingOut, setSigningOut] = useState(false);
  const isHome = location.pathname === '/';
  const isChart = location.pathname.startsWith('/chart');
  const isDarkWorkspace = isChart || location.pathname === '/features' || location.pathname.startsWith('/paper-trading') || location.pathname.startsWith('/forex/') || location.pathname.startsWith('/india/');
  const headerTone = isHome ? 'home-header' : isDarkWorkspace ? 'terminal-header' : 'scrolled header-on-white secondary-header';
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!isHome) return undefined;
    const header = document.querySelector('.app-header');
    const update = () => { header?.classList.toggle('scrolled', window.scrollY > window.innerHeight * 0.65); header?.classList.toggle('header-on-white', window.scrollY > window.innerHeight * 0.65); };
    window.addEventListener('scroll', update, { passive: true }); update();
    return () => window.removeEventListener('scroll', update);
  }, [isHome]);
  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.querySelector('#global-market-search')?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [navigate]);
  async function handleLogout() { setSigningOut(true); try { await logout(); setAccountOpen(false); } finally { setSigningOut(false); } }
  function openSearch() { setSearchOpen(true); window.setTimeout(() => document.querySelector('#global-market-search')?.focus(), 0); }
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) { setIndiaResults([]); setForexResults([]); return undefined; }
    let alive = true;
    const timer = window.setTimeout(() => {
      Promise.allSettled([api.indiaSearch(searchQuery), api.searchForex(searchQuery)]).then(([india, forex]) => {
        if (!alive) return;
        setIndiaResults(india.status === 'fulfilled' ? india.value.data || [] : []);
        setForexResults(forex.status === 'fulfilled' ? forex.value.data || [] : []);
      });
    }, 180);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [searchOpen, searchQuery]);
  const cryptoSearchItems = [
    ['BTCUSDT', 'Bitcoin'], ['ETHUSDT', 'Ethereum'], ['BNBUSDT', 'BNB'], ['SOLUSDT', 'Solana'], ['XRPUSDT', 'XRP'], ['DOGEUSDT', 'Dogecoin']
  ].filter(([symbol, name]) => !searchQuery.trim() || `${symbol} ${name} crypto cryptocurrency`.toLowerCase().includes(searchQuery.trim().toLowerCase()));
  const defaultIndiaSearch = searchQuery.trim() ? [] : [
    { exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', assetType: 'india_stock' },
    { exchange: 'NSE', symbol: 'NIFTY', name: 'NIFTY 50', assetType: 'india_index' },
    { exchange: 'BSE', symbol: 'SENSEX', name: 'S&P BSE SENSEX', assetType: 'india_index' }
  ];
  return <>
    <header className={`app-header ${headerTone} ${location.pathname === '/features' ? 'features-header' : ''}`}>
      <div className="header-left"><Link className="brand" to="/" aria-label="TradingView Clone home"><svg className="brand-logo-svg" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14c2.5-4 4.5 4 7 0 2.5-4 4.5 4 7 0" /><line x1="17" y1="21" x2="22" y2="7" /><circle cx="25" cy="7" r="1.5" fill="currentColor" stroke="none" /></svg><span className="brand-name">TradingView</span></Link>
        <button className="mobile-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="main-navigation">{menuOpen ? <X size={17} /> : <Menu size={17} />}</button>
        <button className="header-search-ctrlk" onClick={openSearch}><Search size={14} /><span>Search (Ctrl+K)</span></button>
        <nav id="main-navigation" className={`header-menu ${menuOpen ? 'mobile-active' : ''}`} aria-label="Main navigation">
          <div className="menu-dropdown-wrapper"><Link to="/features" className={`menu-link ${location.pathname === '/features' ? 'active' : ''}`}>Products</Link><div className="dropdown-menu-card products-dropdown"><Link className="drop-header-super" to="/chart/BTCUSDT"><span className="super-logo-box"><Activity size={15} /></span><span className="super-text-box"><span className="super-title">Supercharts</span><span className="super-desc">The market charting workspace</span></span></Link><span className="dropdown-section-title">Your workspace</span><Link className="drop-simple-link" to="/markets/crypto">Crypto markets</Link><Link className="drop-simple-link" to="/paper-trading">Paper trading</Link><Link className="drop-simple-link" to="/features">Explore features</Link><Link className="drop-simple-link" to="/pricing">Pricing</Link></div></div>
          <div className="menu-dropdown-wrapper"><Link to="/#community-ideas" className="menu-link">Community</Link><div className="dropdown-menu-card community-dropdown"><span className="dropdown-section-title">Created by traders</span><Link className="drop-simple-link" to="/#community-ideas">Community ideas</Link><Link className="drop-simple-link" to="/#community">Community news</Link></div></div>
          <div className="menu-dropdown-wrapper"><Link to="/markets/crypto" className="menu-link">Markets</Link><div className="dropdown-menu-card markets-dropdown-menu"><div className="dropdown-col-left"><span className="dropdown-section-title">Markets</span><Link className="drop-simple-link" to="/markets/crypto">Crypto overview</Link><Link className="drop-simple-link" to="/markets/forex">Forex overview</Link><Link className="drop-simple-link" to="/markets/india">India overview</Link><Link className="drop-simple-link" to="/markets/india/nse">NSE equities</Link><Link className="drop-simple-link" to="/markets/india/bse">BSE equities</Link><Link className="drop-simple-link" to="/chart/BTCUSDT">Bitcoin chart</Link></div><div className="dropdown-col-right"><span className="dropdown-section-title">Popular instruments</span>{['EURUSD', 'GBPUSD', 'USDJPY'].map((symbol) => <Link className="drop-simple-link" to={`/forex/${symbol}`} key={symbol}>{symbol}</Link>)}{['BTCUSDT', 'ETHUSDT', 'SOLUSDT'].map((symbol) => <Link className="drop-simple-link" to={`/chart/${symbol}`} key={symbol}>{symbol}</Link>)}</div></div></div>
          <div className="menu-dropdown-wrapper"><Link to="/paper-trading" className="menu-link">Brokers</Link></div>
          <div className="menu-dropdown-wrapper"><Link to="/features" className="menu-link">More</Link><div className="dropdown-menu-card more-dropdown"><Link className="drop-simple-link" to="/features">Features</Link><Link className="drop-simple-link" to="/pricing">Pricing</Link><Link className="drop-simple-link" to="/paper-trading">Paper trading</Link></div></div>
        </nav>
      </div>
      {searchOpen && <div className="global-search-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}><section className="global-search-panel" role="dialog" aria-modal="true" aria-label="Search markets"><label className="global-search-input"><Search size={17} /><input id="global-market-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Search Indian stocks, indices, Forex or crypto" autoComplete="off" /><button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(''); }} aria-label="Close search"><X size={16} /></button></label><div className="global-search-results">
        <div><p>Indian markets</p>{(searchQuery.trim() ? indiaResults : defaultIndiaSearch).slice(0, 7).map((item) => <Link key={`${item.exchange}:${item.symbol}`} to={`/india/${item.exchange}/${item.symbol}`} onClick={() => setSearchOpen(false)}><span><b>{item.symbol}</b><small>{item.name}</small></span><em>{item.exchange} · {item.assetType === 'india_index' ? 'Index' : 'Equity'}</em></Link>)}{searchQuery.trim() && !indiaResults.length && <small>No Indian matches</small>}</div>
        <div><p>Forex & crypto</p>{(searchQuery.trim() ? forexResults.slice(0, 4) : []).map((item) => <Link key={item.symbol} to={`/forex/${item.symbol}`} onClick={() => setSearchOpen(false)}><span><b>{item.pair || item.symbol}</b><small>{item.name}</small></span><em>Forex</em></Link>)}{cryptoSearchItems.slice(0, 5).map(([symbol, name]) => <Link key={symbol} to={`/chart/${symbol}`} onClick={() => setSearchOpen(false)}><span><b>{symbol.replace('USDT', '')}</b><small>{name}</small></span><em>Crypto</em></Link>)}{searchQuery.trim() && !forexResults.length && !cryptoSearchItems.length && <small>No Forex or crypto matches</small>}</div>
      </div></section></div>}
      <div className="header-right"><div className="menu-dropdown-wrapper"><div className="header-region"><Globe2 size={16} /><span>IN</span></div><div className="dropdown-menu-card language-dropdown"><div className="lang-item active">English (India)</div><div className="lang-item">English</div></div></div><div className="header-auth-group"><div className={`profile-menu-wrapper ${accountOpen ? 'menu-open' : ''}`} onMouseLeave={() => setAccountOpen(false)}><button className="profile-trigger-btn" aria-label="Profile menu" onClick={() => setAccountOpen(!accountOpen)}><span className={`profile-avatar ${user ? 'user-avatar' : 'guest-avatar'}`}>{user ? (user.name || 'T').slice(0, 1).toUpperCase() : <CircleUserRound size={21} />}</span></button><div className="profile-dropdown-menu">{user ? <><div className="profile-user-info"><div className="user-details"><span className="user-name-display">{user.name}</span><span className="user-email-display">{user.email}</span></div></div><div className="profile-drop-divider" /><button className="profile-drop-item" onClick={handleLogout} disabled={signingOut}><LogOut size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button></> : <Link to="/signin" className="profile-drop-item signin-link"><CircleUserRound size={16} />Sign in</Link>}<div className="profile-drop-divider" /><Link to="/paper-trading" className="profile-drop-item"><ShieldCheck size={16} />Paper trading</Link></div></div><Link className="header-chart-cta" to="/pricing">Get started</Link></div></div>
    </header>
  </>;
}

export function Footer() {
  return <footer className="app-footer"><div className="footer-columns"><div className="footer-col"><h4>Products</h4><Link to="/chart/BTCUSDT">Supercharts</Link><Link to="/markets/crypto">Crypto market</Link><Link to="/markets/forex">Forex market</Link><Link to="/markets/india">Indian stock market</Link><Link to="/paper-trading">Paper trading</Link></div><div className="footer-col"><h4>Community</h4><Link to="/#community-ideas">Trading ideas</Link><Link to="/#community">Market news</Link></div><div className="footer-col"><h4>Company</h4><Link to="/features">Features</Link><Link to="/pricing">Pricing plans</Link><Link to="/signup">Create account</Link></div></div><div className="footer-disclaimer"><p>Market data and paper trading are for research and practice. Simulated balances and results do not represent real transactions.</p><p>© 2026 TradingView Clone.</p></div></footer>;
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="page-wrap"><LoadingState label="Checking your session…" /></main>;
  if (!user) {
    const from = { pathname: location.pathname, search: location.search, hash: location.hash };
    return <Navigate to="/signin" state={{ from }} replace />;
  }
  return children;
}
