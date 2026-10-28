import { useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { Activity, BellPlus, ChevronDown, CircleHelp, Maximize2, Plus, Star, TrendingUp, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState, money } from '../components/Shared';

const intervals = ['15m', '1h', '4h', '1d', '1w'];

function ChartSurface({ symbol, interval }) {
  const host = useRef(null);
  const [state, setState] = useState({ status: 'loading', error: '' });
  const [quote, setQuote] = useState(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return undefined;
    let disposed = false;
    let chart, series, socket, resizeObserver;
    setState({ status: 'loading', error: '' });
    api.klines(symbol, interval, 300).then((rows) => {
      if (disposed) return;
      if (!Array.isArray(rows) || !rows.length) throw new Error('No candle data is available for this pair.');
      chart = createChart(root, {
        width: root.clientWidth || 800,
        height: root.clientHeight || 520,
        layout: { background: { color: '#0d111d' }, textColor: '#aab2c0', fontFamily: 'Inter, system-ui, sans-serif' },
        grid: { vertLines: { color: 'rgba(255,255,255,.035)' }, horzLines: { color: 'rgba(255,255,255,.045)' } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(107, 137, 255, .45)' }, horzLine: { color: 'rgba(107, 137, 255, .45)' } },
        rightPriceScale: { borderColor: 'rgba(255,255,255,.08)' },
        timeScale: { borderColor: 'rgba(255,255,255,.08)', timeVisible: true, secondsVisible: false },
        handleScroll: true,
        handleScale: true
      });
      series = chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645' });
      const candleData = rows.filter((row) => Array.isArray(row) && row.length >= 7).map((row) => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]) })).filter((candle) => Number.isFinite(candle.time) && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
      series.setData(candleData);
      chart.timeScale().fitContent();
      resizeObserver = new ResizeObserver(() => chart?.applyOptions({ width: root.clientWidth, height: root.clientHeight || 520 }));
      resizeObserver.observe(root);
      setState({ status: 'ready', error: '' });
      socket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const candle = message.k;
          if (!candle || disposed) return;
          const point = { time: Math.floor(candle.t / 1000), open: Number(candle.o), high: Number(candle.h), low: Number(candle.l), close: Number(candle.c) };
          series?.update(point);
          setQuote({ price: point.close, change: Number(candle.c) - Number(candle.o), candleTime: candle.T });
        } catch { /* Ignore malformed stream events. */ }
      };
    }).catch((error) => { if (!disposed) setState({ status: 'error', error: error.message }); });
    api.ticker([symbol]).then((data) => { if (!disposed && Array.isArray(data) && data[0]) setQuote({ price: Number(data[0].lastPrice), change: Number(data[0].priceChange), changePercent: Number(data[0].priceChangePercent) }); }).catch(() => {});
    return () => { disposed = true; resizeObserver?.disconnect(); if (socket) { socket.onmessage = null; socket.close(); } chart?.remove(); };
  }, [symbol, interval]);

  return <div className="chart-plot-wrap"><div className="chart-plot-head"><div><span className="chart-live-dot" /> Binance live</div><span>{quote?.price ? `$${money(quote.price, 4)}` : 'Loading quote…'}{quote?.changePercent !== undefined && <small className={quote.changePercent >= 0 ? 'positive' : 'negative'}>{quote.changePercent >= 0 ? '+' : ''}{money(quote.changePercent)}%</small>}</span></div><div className="chart-plot" ref={host} aria-label={`${symbol} ${interval} candlestick chart`}>{state.status === 'loading' && <div className="chart-overlay"><LoadingState label="Loading completed market candles…" /></div>}{state.status === 'error' && <div className="chart-overlay"><ErrorState message={state.error || 'Could not load candles.'} /></div>}</div><div className="chart-caption">Candles from Binance. The current candle updates live; closed candles form the historical price series.</div></div>;
}

function WatchlistPanel({ selected, onSelect }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]), [query, setQuery] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState('');
  async function load() {
    if (!user) { setItems(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((symbol) => ({ symbol, displayName: symbol, _id: symbol }))); return; }
    setLoading(true); setError('');
    try { const response = await api.watchlist(); setItems(response.data?.items || []); } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [user]);
  async function add() {
    const symbol = query.trim().toUpperCase().replace('/', '');
    if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) { setError('Enter a Binance USDT pair, for example BTCUSDT.'); return; }
    if (!user) { setError('Sign in to save your watchlist.'); return; }
    setLoading(true); setError('');
    try { await api.addToWatchlist({ symbol, assetType: 'crypto', exchange: 'BINANCE', provider: 'binance', displayName: symbol }); setQuery(''); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }
  async function remove(item) { try { await api.removeFromWatchlist(item._id); await load(); } catch (requestError) { setError(requestError.message); } }
  return <section className="terminal-panel watchlist-panel"><header><h2><Star size={15} /> Watchlist</h2><span>{items.length} assets</span></header><form className="watchlist-add" onSubmit={(event) => { event.preventDefault(); add(); }}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add BTCUSDT" aria-label="Add trading pair" /><button title="Add pair" disabled={loading}><Plus size={15} /></button></form>{error && <p className="inline-error">{error}</p>}{loading && !items.length ? <LoadingState label="Loading watchlist…" /> : <div className="watchlist-items">{items.map((item) => <div className={`watchlist-row ${selected === item.symbol ? 'active' : ''}`} key={item._id || item.symbol}><button className="watchlist-select" onClick={() => onSelect(item.symbol)}><span className="coin-avatar">{item.symbol?.slice(0, 1)}</span><span><b>{item.displayName || item.symbol}</b><small>{item.symbol}</small></span></button>{user && <button className="remove-watch" aria-label={`Remove ${item.symbol}`} onClick={() => remove(item)}><X size={13} /></button>}</div>)}</div>}{!user && <Link className="sign-in-note" to="/signin">Sign in to sync this list</Link>}</section>;
}

function AlertPanel({ symbol }) {
  const { user } = useAuth();
  const [target, setTarget] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setMessage('');
    if (!user) { setMessage('Sign in to create an alert.'); return; }
    setBusy(true);
    try { await api.createAlert({ symbol, assetType: 'crypto', condition: 'greater_than', targetValue: Number(target) }); setMessage('Price alert saved.'); setTarget(''); }
    catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <form className="alert-quick-form" onSubmit={submit}><label htmlFor="alert-target"><BellPlus size={14} /> Alert when price rises above</label><div><span>$</span><input id="alert-target" type="number" min="0.00000001" step="any" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Target price" required /><button className="button button-secondary" disabled={busy}>{busy ? 'Saving…' : 'Create alert'}</button></div>{message && <small className={message.includes('saved') ? 'positive' : 'inline-error'}>{message}</small>}</form>;
}

export default function Chart() {
  const { symbol: routeSymbol } = useParams();
  const [symbol, setSymbol] = useState(routeSymbol?.toUpperCase() || 'BTCUSDT');
  const [interval, setInterval] = useState('1h');
  useEffect(() => { setSymbol(routeSymbol?.toUpperCase() || 'BTCUSDT'); }, [routeSymbol]);
  const asset = useMemo(() => symbol.replace('USDT', ''), [symbol]);
  return <main className="page-wrap page-content terminal-page"><div className="terminal-topline"><div><span className="eyebrow">Trading terminal</span><h1>{asset} <small>/ USDT</small></h1><p>Live market chart and personal market tools.</p></div><Link to="/paper-trading" className="button button-primary"><TrendingUp size={15} /> Paper trade</Link></div>
    <div className="terminal-layout"><div className="terminal-main"><section className="terminal-card chart-card"><header className="chart-toolbar"><div className="chart-symbol-label"><span className="coin-avatar large">{asset.slice(0, 1)}</span><div><b>{symbol}</b><small>Binance Spot · Cryptocurrency</small></div><ChevronDown size={14} /></div><div className="interval-tabs">{intervals.map((time) => <button key={time} onClick={() => setInterval(time)} className={interval === time ? 'active' : ''}>{time}</button>)}</div><button className="chart-tool-button" title="Market chart"><Maximize2 size={15} /></button></header><ChartSurface symbol={symbol} interval={interval} /></section><section className="terminal-card trading-tools"><div className="trading-tool-heading"><div><h2>Market tools</h2><p>Set an alert or place a simulated market order.</p></div><CircleHelp size={16} /></div><AlertPanel symbol={symbol} /></section></div><aside className="terminal-sidebar"><WatchlistPanel selected={symbol} onSelect={(next) => setSymbol(next)} /><section className="terminal-panel terminal-note"><div><Activity size={17} /><b>Market data</b></div><p>Charts and prices use Binance spot market data. Crypto markets trade continuously and can move quickly.</p></section></aside></div>
  </main>;
}
