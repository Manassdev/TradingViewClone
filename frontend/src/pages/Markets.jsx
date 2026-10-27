import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCw, Search, Star } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../services/api';
import { ErrorState, LoadingState, money, SectionHeading, Sparkline } from '../components/Shared';

const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'SHIBUSDT'];

export default function Markets() {
  const [rows, setRows] = useState([]), [status, setStatus] = useState('loading'), [filter, setFilter] = useState('');
  async function load() { setStatus('loading'); try { const data = await api.ticker(symbols); setRows(Array.isArray(data) ? data : []); setStatus('ready'); } catch { setStatus('error'); } }
  useEffect(() => { load(); const timer = window.setInterval(load, 30_000); return () => window.clearInterval(timer); }, []);
  const visible = rows.filter((row) => row.symbol.toLowerCase().includes(filter.trim().toLowerCase()));
  return <main className="page-wrap page-content market-page"><div className="market-page-heading"><SectionHeading eyebrow="Markets" title="Crypto market overview" description="Track live prices and 24-hour movement for popular cryptocurrency pairs." /><Link className="button button-secondary" to="/chart/BTCUSDT">Open chart <ArrowRight size={14} /></Link></div>
    <div className="market-toolbar"><div className="search-field"><Search size={15} /><input id="market-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search symbol" /></div><button className="button button-secondary" onClick={load} disabled={status === 'loading'}><RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} /> Refresh</button></div>
    {status === 'loading' && !rows.length ? <LoadingState label="Loading crypto markets…" /> : status === 'error' && !rows.length ? <ErrorState message="Market data is temporarily unavailable." onRetry={load} /> : !visible.length ? <div className="state-card"><h3>No markets found</h3><p>Try another symbol.</p></div> : <div className="market-table-wrap"><table className="market-table"><thead><tr><th>Asset</th><th>Price</th><th>24h change</th><th>24h high</th><th>24h low</th><th>24h volume</th><th>Trend</th><th /></tr></thead><tbody>{visible.map((row) => {
      const up = Number(row.priceChangePercent) >= 0;
      return <tr key={row.symbol}><td><Link className="market-asset" to={`/chart/${row.symbol}`}><span className="coin-avatar">{row.symbol.slice(0, 1)}</span><span><b>{row.symbol.replace('USDT', '')}</b><small>{row.symbol}</small></span></Link></td><td className="table-strong">${money(row.lastPrice, 4)}</td><td className={up ? 'positive' : 'negative'}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{up ? '+' : ''}{money(row.priceChangePercent)}%</td><td>${money(row.highPrice, 4)}</td><td>${money(row.lowPrice, 4)}</td><td>${money(row.quoteVolume, 0)}</td><td><Sparkline positive={up} data={[]} /></td><td><Link className="table-open-link" to={`/chart/${row.symbol}`}>Open <ArrowRight size={13} /></Link></td></tr>;
    })}</tbody></table><p className="table-disclaimer">Prices and 24-hour market metrics from Binance. Values may change between updates.</p></div>}
  </main>;
}
