import { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ArrowLeft, LineChart, RefreshCw, Star, BellRing } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState } from '../components/Shared';

const intervals = ['1D', '1W', '1M'];
const inr = (value, digits = 2) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
const timeIST = (value) => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';

export default function IndiaChart() {
  const params = useParams();
  const exchange = String(params.exchange || 'NSE').toUpperCase();
  const symbol = String(params.symbol || params.singleSymbol || 'RELIANCE').toUpperCase();
  const { user } = useAuth();
  const host = useRef(null);
  const [instrument, setInstrument] = useState(null);
  const [quote, setQuote] = useState(null);
  const [candles, setCandles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [interval, setInterval] = useState('1D');
  const [chartType, setChartType] = useState('candles');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState('greater_than');
  const [alertMessage, setAlertMessage] = useState('');

  async function loadData() {
    setStatus('loading'); setError('');
    const [registry, quoteResult, candleResult] = await Promise.allSettled([
      api.indiaInstruments(exchange), api.indiaQuote(exchange, symbol), api.indiaCandles(exchange, symbol, interval, 180)
    ]);
    if (registry.status === 'fulfilled') setInstrument(registry.value.data?.find((item) => item.symbol === symbol) || null);
    else setInstrument(null);
    if (quoteResult.status === 'fulfilled') setQuote(quoteResult.value.data);
    else { setQuote(null); setError(quoteResult.reason?.message || 'Quote unavailable.'); }
    if (candleResult.status === 'fulfilled') {
      const rows = candleResult.value.data?.candles || [];
      setCandles(rows); setStatus(rows.length ? 'ready' : 'empty');
      if (!rows.length) setError('No historical candles are available for this instrument and interval.');
    } else { setCandles([]); setStatus('error'); setError(candleResult.reason?.message || 'Historical data unavailable.'); }
  }

  useEffect(() => { loadData(); }, [exchange, symbol, interval]);
  useEffect(() => {
    if (!user) { setFavorite(false); return; }
    api.watchlists().then((result) => setFavorite((result.data || []).some((list) => (list.items || []).some((item) => item.assetType?.startsWith('india_') && item.exchange === exchange && item.symbol === symbol)))).catch(() => setFavorite(false));
  }, [user, exchange, symbol]);

  useEffect(() => {
    if (!host.current || !candles.length) return undefined;
    const element = host.current;
    const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: interval === '1D' ? undefined : 'short' });
    const chart = createChart(element, {
      width: element.clientWidth,
      height: Math.max(340, element.clientHeight),
      layout: { background: { color: '#101522' }, textColor: '#9ba8bd', fontFamily: 'Arial, sans-serif' },
      localization: { locale: 'en-IN', priceFormatter: (price) => inr(price), timeFormatter: (time) => dateFormat.format(new Date(Number(time) * 1000)) },
      grid: { vertLines: { color: 'rgba(160,176,202,.08)' }, horzLines: { color: 'rgba(160,176,202,.08)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(160,176,202,.18)' },
      timeScale: { borderColor: 'rgba(160,176,202,.18)', timeVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
    });
    const priceFormat = { type: 'price', precision: 2, minMove: .01 };
    const series = chartType === 'candles'
      ? chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350', priceFormat })
      : chart.addLineSeries({ color: '#668dff', lineWidth: 2, priceLineVisible: true, priceFormat });
    const points = candles.map((candle) => ({
      time: Math.floor(Date.parse(candle.time) / 1000),
      ...(chartType === 'candles' ? { open: candle.open, high: candle.high, low: candle.low, close: candle.close } : { value: candle.close })
    })).filter((point) => Number.isFinite(point.time)).sort((a, b) => a.time - b.time).filter((point, index, all) => index === 0 || point.time > all[index - 1].time);
    series.setData(points); chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((event) => {
      const time = event.time;
      const timestamp = typeof time === 'number' ? time : time && typeof time === 'object' ? Date.UTC(time.year, time.month - 1, time.day) / 1000 : null;
      const row = timestamp === null ? null : candles.find((item) => Math.floor(Date.parse(item.time) / 1000) === timestamp);
      setSelected(row || null);
    });
    const observer = new ResizeObserver((entries) => { if (entries[0]) chart.applyOptions({ width: Math.max(280, entries[0].contentRect.width), height: Math.max(340, entries[0].contentRect.height) }); });
    observer.observe(element);
    return () => { observer.disconnect(); chart.remove(); };
  }, [candles, chartType, interval]);

  const bar = selected || candles.at(-1);
  const statusText = quote?.marketStatus?.state || 'unknown';

  async function toggleFavorite() {
    if (!user) { setError('Sign in to save Indian instruments to your watchlist.'); return; }
    setBusy(true); setError('');
    try {
      if (favorite) {
        const result = await api.watchlists();
        for (const list of result.data || []) {
          const item = (list.items || []).find((row) => row.assetType === instrument.assetType && row.exchange === exchange && row.symbol === symbol);
          if (item) await api.removeFromWatchlist(item._id, list._id);
        }
        setFavorite(false);
      } else {
        await api.addToWatchlist({ symbol, assetType: instrument.assetType, exchange, provider: 'twelvedata', displayName: instrument.name });
        setFavorite(true);
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function createPriceAlert(event) {
    event.preventDefault();
    if (!user) { setAlertMessage('Sign in to create a persistent alert.'); return; }
    setBusy(true); setAlertMessage('');
    try {
      await api.createAlert({ symbol, exchange, assetType: instrument.assetType, condition, targetValue: Number(target) });
      setTarget(''); setAlertMessage('Alert saved. It will be evaluated against new EOD quotes while the backend is running.');
    } catch (requestError) { setAlertMessage(requestError.message); }
    finally { setBusy(false); }
  }

  if (status === 'loading' && !instrument) return <main className="page-wrap page-content india-chart-page"><LoadingState label="Loading Indian instrument…" /></main>;
  if (!instrument) return <main className="page-wrap page-content india-chart-page"><ErrorState message="This symbol is not registered on the selected exchange." /><Link className="button button-secondary" to="/markets/india"><ArrowLeft size={14} /> India market</Link></main>;
  return <main className="page-wrap page-content india-chart-page">
    <Link className="forex-back-link" to={`/markets/india/${exchange.toLowerCase()}`}><ArrowLeft size={14} /> India markets</Link>
    <div className="forex-chart-heading"><div><p className="eyebrow">India · {exchange} · {instrument.assetType === 'india_index' ? 'Index' : instrument.sector}</p><h1>{instrument.name} <small>{exchange}:{symbol}</small></h1><p>{instrument.currency} · Provider symbol {instrument.providerSymbol}</p></div><button className={`button ${favorite ? 'button-primary' : 'button-secondary'}`} onClick={toggleFavorite} disabled={busy}><Star size={14} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'In watchlist' : 'Add to watchlist'}</button></div>
    <div className="forex-quote-strip india-quote-strip"><div><small>Last provider close</small><b>{inr(quote?.price)}</b></div><div><small>Daily change</small><b className={quote ? quote.changePercent >= 0 ? 'positive' : 'negative' : ''}>{Number.isFinite(quote?.changePercent) ? `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '—'}</b></div><div><small>Open / previous close</small><b>{quote ? `${inr(quote.open)} / ${inr(quote.previousClose)}` : '—'}</b></div><div><small>Day range</small><b>{quote ? `${inr(quote.low)} – ${inr(quote.high)}` : '—'}</b></div><div><small>Market status</small><b>{statusText}</b></div><div><small>Provider · as of</small><b>{quote ? `${quote.provider} · ${timeIST(quote.updatedAt)}` : '—'}{quote?.isStale && <em className="forex-stale">Stale provider quote</em>}</b></div></div>
    <section className="forex-chart-card"><div className="forex-chart-toolbar"><div className="forex-timeframes" role="group" aria-label="Supported EOD chart timeframe">{intervals.map((frame) => <button key={frame} className={interval === frame ? 'active' : ''} aria-pressed={interval === frame} onClick={() => setInterval(frame)}>{frame}</button>)}</div><span className="india-eod-label">End-of-day data</span><button className="forex-chart-type" onClick={() => setChartType((value) => value === 'candles' ? 'line' : 'candles')}><LineChart size={14} />{chartType === 'candles' ? 'Line' : 'Candles'}</button><button className="forex-chart-type" onClick={loadData} title="Refresh provider quote and candles" disabled={status === 'loading'}><RefreshCw size={14} /> Refresh</button></div><div className="forex-ohlc"><b>{exchange}:{symbol}</b><span>O {bar ? inr(bar.open) : '—'}</span><span>H {bar ? inr(bar.high) : '—'}</span><span>L {bar ? inr(bar.low) : '—'}</span><span>C {bar ? inr(bar.close) : '—'}</span><span>Vol {Number.isFinite(bar?.volume) ? Number(bar.volume).toLocaleString('en-IN') : '—'}</span></div><div className="forex-chart-host" ref={host} />{status === 'loading' && !candles.length && <div className="forex-chart-overlay"><LoadingState label="Loading genuine Indian EOD candles…" /></div>}{status === 'error' && !candles.length && <div className="forex-chart-overlay"><ErrorState message={error || 'Indian candles unavailable.'} onRetry={loadData} /></div>}{status === 'empty' && <div className="forex-chart-overlay"><p>No candles are available for this instrument and interval.</p></div>}<p className="table-disclaimer">Twelve Data currently lists Indian exchange prices as end-of-day data. Intraday timeframes and tick-level quotes are disabled. Candle times are converted from Asia/Kolkata to UTC for storage and displayed as IST.</p></section>
    {error && <p className="india-error" role="alert">{error}</p>}
    <section className="india-alert-card"><header><div><p className="eyebrow">Server monitored · EOD</p><h2><BellRing size={18} /> Create price alert</h2></div><span>New closing prices only</span></header><form onSubmit={createPriceAlert}><label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="greater_than">Price above</option><option value="less_than">Price below</option><option value="crosses_up">Crosses above</option><option value="crosses_down">Crosses below</option></select></label><label>Target price (INR)<input type="number" min="0.01" step="0.01" required value={target} onChange={(event) => setTarget(event.target.value)} placeholder="e.g. 2500" /></label><button className="button button-primary" disabled={busy || !target}>Save alert</button></form>{alertMessage && <p role="status">{alertMessage}</p>}<small>India alerts are evaluated from newly updated daily provider closes by the backend scheduler. They do not trigger intraday. They continue only while this app's backend is running and connected to MongoDB.</small></section>
  </main>;
}
