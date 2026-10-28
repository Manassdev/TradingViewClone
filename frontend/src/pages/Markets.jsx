import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, RefreshCw, Search } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../services/api';
import { ErrorState, LoadingState, money } from '../components/Shared';
import { MarketOverviewChart, MarketOverviewHero } from '../components/MarketOverview';

const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'LINKUSDT', 'LTCUSDT', 'SHIBUSDT'];

export default function Markets() {
  const [rows, setRows] = useState([]), [status, setStatus] = useState('loading'), [filter, setFilter] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [history, setHistory] = useState([]), [historyStatus, setHistoryStatus] = useState('loading');
  const quoteRequest = useRef(null);
  const load = useCallback(async () => {
    quoteRequest.current?.abort();
    const controller = new AbortController();
    quoteRequest.current = controller;
    setStatus('loading');
    try {
      const data = await api.ticker(symbols, controller.signal);
      if (quoteRequest.current === controller) { setRows(Array.isArray(data) ? data : []); setStatus('ready'); }
    } catch (error) {
      if (error.name !== 'AbortError' && quoteRequest.current === controller) setStatus('error');
    } finally { if (quoteRequest.current === controller) quoteRequest.current = null; }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 30_000); return () => { window.clearInterval(timer); quoteRequest.current?.abort(); }; }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    setHistoryStatus('loading');
    api.klines(selectedSymbol, '1d', 180, controller.signal).then((result) => {
      if (!Array.isArray(result)) throw new Error('Invalid candle response');
      setHistory(result.filter((row) => Array.isArray(row) && Number(row[0]) > 0 && Number(row[4]) > 0).map((row) => ({ time: Number(row[0]), value: Number(row[4]) })));
      setHistoryStatus('ready');
    }).catch((error) => { if (error.name !== 'AbortError') { setHistory([]); setHistoryStatus('error'); } });
    return () => controller.abort();
  }, [selectedSymbol]);
  const visible = rows.filter((row) => row.symbol.toLowerCase().includes(filter.trim().toLowerCase()));
  const selected = rows.find((row) => row.symbol === selectedSymbol);
  const summary = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT'].map((symbol) => rows.find((row) => row.symbol === symbol)).filter(Boolean);
  const movers = [...rows].filter((row) => Number.isFinite(Number(row.priceChangePercent))).sort((a, b) => Number(b.priceChangePercent) - Number(a.priceChangePercent));
  const turnover = [...rows].sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume)).slice(0, 3);
  const historyUp = history.length > 1 && history.at(-1).value >= history[0].value;
  const assetNames = { BTCUSDT: 'Bitcoin', ETHUSDT: 'Ethereum', BNBUSDT: 'BNB', XRPUSDT: 'XRP' };
  return <main className="page-wrap page-content market-page market-overview-page"><MarketOverviewHero market="Crypto" />
    <section className="market-overview-section"><h2 className="market-overview-section-title">Market summary <ChevronRightIcon /></h2>
      <div className="market-summary-pills">{summary.map((row) => { const up = Number(row.priceChangePercent) >= 0; return <button key={row.symbol} className={`market-summary-pill ${selectedSymbol === row.symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(row.symbol)}><span className={`coin-avatar market-summary-avatar ${row.symbol === 'BTCUSDT' ? 'bitcoin' : ''}`}>{row.symbol.slice(0, 1)}</span><span className="market-summary-copy"><b>{assetNames[row.symbol] || row.symbol.replace('USDT', '')}</b><span>{money(row.lastPrice, 2)} <small>USD</small><em className={up ? 'positive' : 'negative'}>{up ? '+' : ''}{money(row.priceChangePercent)}%</em></span></span></button>; })}</div>
      <div className="market-overview-panels"><section className="market-overview-main-card"><header className="market-overview-chart-heading"><div><h3>{assetNames[selectedSymbol] || selectedSymbol.replace('USDT', '')} price</h3><p>Daily close · 180 days · Binance</p></div><div className="market-overview-chart-price">{selected ? `$${money(selected.lastPrice, 2)}` : '—'}{selected && <small className={Number(selected.priceChangePercent) >= 0 ? 'positive' : 'negative'}>{Number(selected.priceChangePercent) >= 0 ? '+' : ''}{money(selected.priceChangePercent)}% today</small>}</div></header><MarketOverviewChart data={history} loading={historyStatus === 'loading'} color={historyUp ? '#00a784' : '#f23645'} precision={selectedSymbol === 'BTCUSDT' ? 2 : 4} label={`${selectedSymbol} daily price chart from Binance`} /><footer className="market-overview-chart-footer"><span>6 months</span><Link to={`/chart/${selectedSymbol}`}>Open full chart <ArrowRight size={13} /></Link></footer></section>
        <aside className="market-overview-aside"><section className="market-overview-side-card"><h3>Top 24h gainers</h3>{movers.slice(0, 3).map((row) => <Link to={`/chart/${row.symbol}`} key={row.symbol}><span><b>{row.symbol.replace('USDT', '')}</b><small>${money(row.lastPrice, 2)}</small></span><strong className="positive">+{money(row.priceChangePercent)}%</strong></Link>)}</section><section className="market-overview-side-card"><h3>Highest 24h turnover</h3>{turnover.map((row) => <Link to={`/chart/${row.symbol}`} key={row.symbol}><span><b>{row.symbol.replace('USDT', '')}</b><small>Binance spot</small></span><strong>${money(row.quoteVolume, 0)}</strong></Link>)}</section></aside>
      </div>
      <p className="market-overview-disclaimer">Prices and OHLC history are Binance spot data. Turnover is the provider's 24-hour quote volume; this overview does not estimate total crypto market capitalization or dominance.</p>
    </section>
    <div className="market-toolbar"><div className="search-field"><Search size={15} /><input id="market-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search symbol" /></div><button className="button button-secondary" onClick={load} disabled={status === 'loading'}><RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} /> Refresh</button></div>
    {status === 'loading' && !rows.length ? <LoadingState label="Loading crypto markets…" /> : status === 'error' && !rows.length ? <ErrorState message="Market data is temporarily unavailable." onRetry={load} /> : !visible.length ? <div className="state-card"><h3>No markets found</h3><p>Try another symbol.</p></div> : <div className="market-table-wrap"><table className="market-table"><thead><tr><th>Asset</th><th>Price</th><th>24h change</th><th>24h high</th><th>24h low</th><th>24h volume</th><th>Trend</th><th /></tr></thead><tbody>{visible.map((row) => {
      const up = Number(row.priceChangePercent) >= 0;
      return <tr key={row.symbol}><td><Link className="market-asset" to={`/chart/${row.symbol}`}><span className="coin-avatar">{row.symbol.slice(0, 1)}</span><span><b>{row.symbol.replace('USDT', '')}</b><small>{row.symbol}</small></span></Link></td><td className="table-strong">${money(row.lastPrice, 4)}</td><td className={up ? 'positive' : 'negative'}>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{up ? '+' : ''}{money(row.priceChangePercent)}%</td><td>${money(row.highPrice, 4)}</td><td>${money(row.lowPrice, 4)}</td><td>${money(row.quoteVolume, 0)}</td><td><span aria-label="Trend chart unavailable">—</span></td><td><Link className="table-open-link" to={`/chart/${row.symbol}`}>Open <ArrowRight size={13} /></Link></td></tr>;
    })}</tbody></table><p className="table-disclaimer">Prices and 24-hour market metrics from Binance. Values may change between updates.</p></div>}
  </main>;
}

function ChevronRightIcon() { return <ArrowRight size={18} aria-hidden="true" />; }
