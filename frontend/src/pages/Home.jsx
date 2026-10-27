import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../services/api';
import { CommunityIdeas, CommunityNews } from '../components/Community';
import { money } from '../components/Shared';

const WATCH_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const ASSET_NAMES = { BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', SOLUSDT: 'Solana', BNBUSDT: 'BNB', XRPUSDT: 'XRP' };

function MarketSummaryChart({ candles }) {
  const values = candles.map((row) => Number(row[4])).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length < 2) return <div className="large-chart-container market-chart-empty">Market chart unavailable</div>;
  const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${92 - ((value - min) / range) * 80}`).join(' ');
  const labels = candles.filter((row) => Number.isFinite(Number(row?.[0]))).filter((_, index) => index % Math.max(1, Math.floor(candles.length / 6)) === 0).slice(0, 6);
  return <><div className="large-chart-container"><svg className="market-summary-sparkline" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Bitcoin hourly price chart from Binance"><line x1="0" y1="25" x2="100" y2="25" /><line x1="0" y1="50" x2="100" y2="50" /><line x1="0" y1="75" x2="100" y2="75" /><polyline points={points} /></svg></div><div className="chart-time-labels">{labels.map((row) => <span key={row[0]}>{new Date(Number(row[0])).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>)}</div></>;
}

function MarketSummary() {
  const [rows, setRows] = useState([]);
  const [candles, setCandles] = useState([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const result = await api.ticker(WATCH_SYMBOLS); if (active) { setRows(Array.isArray(result) ? result : []); setError(false); } }
      catch { if (active) setError(true); }
    };
    const loadCandles = async () => { try { const result = await api.klines('BTCUSDT', '1h', 24); if (active && Array.isArray(result)) setCandles(result); } catch { if (active) setCandles([]); } };
    load(); loadCandles();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const bitcoin = rows.find((row) => row.symbol === 'BTCUSDT');
  const positive = Number(bitcoin?.priceChangePercent) >= 0;
  return (
    <section className="crypto-market-summary-section">
      <div className="crypto-market-summary-container">
        <h2 className="section-title">Market summary <ChevronRight aria-hidden="true" /></h2>
        {error && !rows.length ? (
          <div className="market-summary-error" role="status">
            Live crypto prices are temporarily unavailable. They will retry automatically.
          </div>
        ) : (
          <div className="crypto-summary-layout">
            <Link className="summary-card-large" to="/chart/BTCUSDT">
              <div className="card-header-large">
                <div className="coin-badge-row">
                  <div className="coin-badge-circle">₿</div>
                  <div className="coin-title-group">
                    <span className="coin-name-large">Bitcoin</span>
                    <span className="coin-type-pill">BTC</span>
                  </div>
                </div>
                <div className="coin-price-row">
                  <span className="coin-price-large">{bitcoin ? `$${money(bitcoin.lastPrice)}` : '—'}</span>
                  <span className="coin-price-unit">USD</span>
                  {bitcoin && <span className={`coin-change-large ${positive ? 'text-green' : 'text-red'}`}>{positive ? '+' : ''}{money(bitcoin.priceChangePercent)}%</span>}
                </div>
              </div>
              <MarketSummaryChart candles={candles} />
            </Link>
            <div className="summary-card-list">
              <h3 className="list-title">Major Cryptos</h3>
              <div className="crypto-list-wrapper">
                {rows.map((row) => {
                  const up = Number(row.priceChangePercent) >= 0;
                  return <Link className="crypto-list-item" to={`/chart/${row.symbol}`} key={row.symbol}>
                    <div className="list-item-left">
                      <span className={`coin-logo-mini coin-${row.symbol.toLowerCase().replace('usdt', '')}`}>{row.symbol.startsWith('BTC') ? '₿' : row.symbol.slice(0, 1)}</span>
                      <div className="coin-info-group">
                        <span className="coin-title">{ASSET_NAMES[row.symbol] || row.symbol.replace('USDT', '')}</span>
                        <span className="coin-subtitle-pill">{row.symbol.replace('USDT', '')}</span>
                      </div>
                    </div>
                    <div className="list-item-right">
                      <span className="coin-price">${money(row.lastPrice)}</span>
                      <span className={`coin-change ${up ? 'text-green' : 'text-red'}`}>{up ? '+' : ''}{money(row.priceChangePercent)}%</span>
                    </div>
                  </Link>;
                })}
                {!rows.length && <div className="crypto-list-item loading">{error ? 'Market data unavailable' : 'Loading prices…'}</div>}
              </div>
              <Link className="see-all-link" to="/markets/crypto">See all major cryptos <ChevronRight aria-hidden="true" /></Link>
            </div>
          </div>
        )}
        <p className="market-summary-disclaimer">Prices and hourly candles provided by Binance market data.</p>
      </div>
    </section>
  );
}

export default function Home() {
  return <main className="home-page view-panel">
    <section className="hero-section" aria-labelledby="home-hero-title">
      <h1 className="hero-title" id="home-hero-title">Where the world does markets</h1>
      <p className="hero-subtitle">Join 100 million traders and investors taking the future into their own hands.</p>
      <div className="hero-cta-group">
        <Link to="/pricing" className="hero-cta-btn">Get started for free</Link>
        <span className="hero-cta-tagline">$0 forever, no credit card needed</span>
      </div>
      <a className="hero-scroll-indicator" href="#section-two" aria-label="Scroll to market showcase"><ChevronDown /></a>
    </section>
    <section id="section-two"><h2>Where the world does markets</h2><p>Join traders and investors taking the future into their own hands.</p><div className="section-two-preview-wrapper"><div className="section-two-glow-border"><img src="/assets/images/platform-preview.jpg" alt="TradingView charting platform preview" className="section-two-preview-img" /></div></div><div className="section-two-cta-row"><Link to="/features" className="section-two-explore-btn">Explore features</Link></div></section>
    <MarketSummary />
    <CommunityIdeas />
    <CommunityNews />
  </main>;
}
