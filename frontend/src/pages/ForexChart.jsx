import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ArrowLeft, LineChart, RefreshCw, Search, Star } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ErrorState, formatDate, LoadingState, money } from '../components/Shared';

const frames = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'];
const RECENT_KEY = 'tv_forex_recent';

export default function ForexChart() {
  const { symbol: routeSymbol } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const symbol = String(routeSymbol || 'EURUSD').toUpperCase().replace(/[\s/_-]/g, '').replace(/=X$/, '');
  const chartHost = useRef(null);
  const [pairs, setPairs] = useState([]);
  const [pair, setPair] = useState(null);
  const [quote, setQuote] = useState(null);
  const [candles, setCandles] = useState([]);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [interval, setInterval] = useState('1h');
  const [chartType, setChartType] = useState('candles');
  const [comparison, setComparison] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [favorite, setFavorite] = useState(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const updateRecent = useCallback(() => {
    try {
      const old = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      localStorage.setItem(RECENT_KEY, JSON.stringify([symbol, ...old.filter((item) => item !== symbol)].slice(0, 10)));
    } catch { localStorage.setItem(RECENT_KEY, JSON.stringify([symbol])); }
  }, [symbol]);

  useEffect(() => {
    let active = true;
    api.forexPairs().then((result) => {
      if (!active) return;
      const all = result.data || [];
      setPairs(all);
      setPair(all.find((item) => item.symbol === symbol) || null);
    }).catch(() => { if (active) setPair(null); });
    updateRecent();
    return () => { active = false; };
  }, [symbol, updateRecent]);

  useEffect(() => {
    if (!user) { setFavorite(false); return; }
    api.watchlists().then((result) => setFavorite((result.data || []).some((list) => (list.items || []).some((item) => item.assetType === 'forex' && item.symbol === symbol)))).catch(() => setFavorite(false));
  }, [user, symbol]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus('loading'); setMessage('');
    Promise.allSettled([api.forexQuote(symbol), api.forexCandles(symbol, interval, 300, controller.signal)])
      .then(([quoteResult, candleResult]) => {
        if (!active) return;
        if (quoteResult.status === 'fulfilled') setQuote(quoteResult.value.data);
        if (candleResult.status === 'fulfilled') {
          setCandles(candleResult.value.data.candles || []);
          setStatus(candleResult.value.data.candles?.length ? 'ready' : 'empty');
        } else if (candleResult.reason?.name !== 'AbortError') {
          setStatus('error');
          setMessage(candleResult.reason?.message || 'Forex candles could not be loaded.');
        }
        if (quoteResult.status === 'rejected') setMessage(quoteResult.reason?.message || 'Forex quote unavailable.');
      });
    return () => { active = false; controller.abort(); };
  }, [symbol, interval, refreshIndex]);

  useEffect(() => {
    let active = true;
    api.forexAnalytics(symbol).then((result) => { if (active) setAnalytics(result.data); }).catch(() => { if (active) setAnalytics(null); });
    return () => { active = false; };
  }, [symbol]);

  useEffect(() => {
    if (!chartHost.current || !candles.length) return undefined;
    const host = chartHost.current;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: Math.max(340, host.clientHeight),
      layout: { background: { color: '#101522' }, textColor: '#9ba8bd', fontFamily: 'Arial, sans-serif' },
      grid: { vertLines: { color: 'rgba(160,176,202,.08)' }, horzLines: { color: 'rgba(160,176,202,.08)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(160,176,202,.18)' },
      timeScale: { borderColor: 'rgba(160,176,202,.18)', timeVisible: true, secondsVisible: false },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
    });
    const series = chartType === 'candles'
      ? chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' })
      : chart.addLineSeries({ color: '#668dff', lineWidth: 2, priceLineVisible: true });
    const points = candles.map((item) => ({
      time: Math.floor(Date.parse(item.time) / 1000),
      ...(chartType === 'candles' ? { open: item.open, high: item.high, low: item.low, close: item.close } : { value: item.close })
    })).filter((item) => Number.isFinite(item.time));
    series.setData(points);
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((event) => {
      const time = event.time;
      const timestamp = typeof time === 'number' ? time : time && typeof time === 'object' ? Date.UTC(time.year, time.month - 1, time.day) / 1000 : null;
      const point = timestamp === null ? null : candles.find((item) => Math.floor(Date.parse(item.time) / 1000) === timestamp);
      setSelectedCandle(point || null);
    });
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) chart.applyOptions({ width: Math.max(280, entries[0].contentRect.width), height: Math.max(340, entries[0].contentRect.height) });
    });
    observer.observe(host);
    return () => { observer.disconnect(); chart.remove(); };
  }, [candles, chartType]);

  const currentBar = selectedCandle || candles.at(-1) || null;
  const positive = Number(quote?.changePercent) >= 0;
  const quoteDecimals = pair?.quote === 'JPY' ? 3 : 5;

  async function addFavorite() {
    if (!user) { setMessage('Sign in to save Forex pairs to your watchlist.'); return; }
    setBusy(true); setMessage('');
    try {
      if (favorite) {
        const result = await api.watchlists();
        for (const list of result.data || []) {
          const item = (list.items || []).find((row) => row.assetType === 'forex' && row.symbol === symbol);
          if (item) await api.removeFromWatchlist(item._id, list._id);
        }
        setFavorite(false);
      } else {
        await api.addToWatchlist({ symbol, assetType: 'forex', exchange: 'FX', provider: 'twelvedata', displayName: pair?.pair || symbol });
        setFavorite(true);
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function comparePair(event) {
    event.preventDefault();
    const normalized = comparison.toUpperCase().replace(/[\s/_-]/g, '').replace(/=X$/, '');
    setComparisonResult(null);
    try {
      const result = await api.forexAnalytics(symbol, '1m', normalized);
      setComparisonResult(result.data.comparison);
    } catch (error) { setMessage(error.message); }
  }

  if (!pair && !pairs.length) return <main className="page-wrap page-content forex-chart-page"><LoadingState label="Loading currency pair…" /></main>;
  if (!pair) return <main className="page-wrap page-content forex-chart-page"><ErrorState message="This Forex pair is not supported. Choose a pair from the Forex market overview." /><Link className="button button-secondary" to="/markets/forex"><ArrowLeft size={14} /> Forex overview</Link></main>;

  return <main className="page-wrap page-content forex-chart-page">
    <Link className="forex-back-link" to="/markets/forex"><ArrowLeft size={14} /> Forex markets</Link>
    <div className="forex-chart-heading"><div><p className="eyebrow">Forex · {pair.category}</p><h1>{pair.pair} <small>{pair.name}</small></h1><p>{pair.baseName} quoted in {pair.quoteName}</p></div><button className={`button ${favorite ? 'button-primary' : 'button-secondary'}`} onClick={addFavorite} disabled={busy}><Star size={14} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'In watchlist' : 'Add to watchlist'}</button></div>
    <div className="forex-quote-strip"><div><small>Rate</small><b>{quote ? money(quote.rate, quoteDecimals) : '—'}</b></div><div><small>Daily change</small><b className={quote && Number.isFinite(quote.changePercent) ? positive ? 'positive' : 'negative' : ''}>{quote && Number.isFinite(quote.changePercent) ? `${positive ? '+' : ''}${money(quote.changePercent)}%` : '—'}</b></div><div><small>Bid / ask</small><b>{quote?.bid && quote?.ask ? `${money(quote.bid, quoteDecimals)} / ${money(quote.ask, quoteDecimals)}` : '—'}</b></div><div><small>Spread</small><b>{quote?.spread ? money(quote.spread, quoteDecimals) : '—'}</b></div><div><small>Session</small><b>{quote?.sessionStatus || '—'}{quote?.isStale && <em className="forex-stale">Stale quote</em>}</b></div><div><small>Source · updated</small><b>{quote ? `${quote.provider} · ${formatDate(quote.updatedAt)}` : '—'}</b></div></div>
    <section className="forex-chart-card"><div className="forex-chart-toolbar"><div className="forex-timeframes" role="group" aria-label="Chart timeframe">{frames.map((frame) => <button key={frame} className={interval === frame ? 'active' : ''} aria-pressed={interval === frame} onClick={() => setInterval(frame)}>{frame}</button>)}</div><button className="forex-chart-type" onClick={() => setChartType((type) => type === 'candles' ? 'line' : 'candles')}><LineChart size={14} />{chartType === 'candles' ? 'Line' : 'Candles'}</button><button className="forex-chart-type" onClick={() => { setStatus('loading'); setRefreshIndex((value) => value + 1); }} title="Refresh quote and candles"><RefreshCw size={14} /> Refresh</button></div><div className="forex-ohlc"><b>{pair.pair}</b><span>O {currentBar ? money(currentBar.open, quoteDecimals) : '—'}</span><span>H {currentBar ? money(currentBar.high, quoteDecimals) : '—'}</span><span>L {currentBar ? money(currentBar.low, quoteDecimals) : '—'}</span><span>C {currentBar ? money(currentBar.close, quoteDecimals) : '—'}</span></div><div className="forex-chart-host" ref={chartHost} />{status === 'loading' && !candles.length && <div className="forex-chart-overlay"><LoadingState label="Loading real Forex candles…" /></div>}{status === 'error' && <div className="forex-chart-overlay"><ErrorState message={message || 'Forex candles could not be loaded.'} onRetry={() => setRefreshIndex((value) => value + 1)} /></div>}{status === 'empty' && <div className="forex-chart-overlay"><p>No candles are available for this interval.</p></div>}<p className="table-disclaimer">Candles are real provider OHLC data in UTC, displayed in your local time. Spot Forex volume is not reported or invented.</p></section>
    {message && <p className="forex-error" role="alert">{message}</p>}
    <div className="forex-detail-grid"><section className="forex-detail-card"><h2>Period performance</h2>{analytics ? <><div className="forex-performance"><span>1 month change</span><b className={analytics.periodChangePercent >= 0 ? 'positive' : 'negative'}>{analytics.periodChangePercent === null ? '—' : `${analytics.periodChangePercent >= 0 ? '+' : ''}${money(analytics.periodChangePercent)}%`}</b></div><div className="forex-performance"><span>1 month high / low</span><b>{money(analytics.periodHigh, quoteDecimals)} / {money(analytics.periodLow, quoteDecimals)}</b></div><small>{analytics.candlesCount} daily candles · updated {formatDate(analytics.updatedAt)}</small></> : <p>Analytics require provider access to historical candles and major-pair quotes.</p>}<form className="forex-compare-form" onSubmit={comparePair}><label htmlFor="forex-compare">Compare daily performance with</label><div><input id="forex-compare" list="forex-pair-suggestions" value={comparison} onChange={(event) => setComparison(event.target.value)} placeholder="USD/JPY" /><datalist id="forex-pair-suggestions">{pairs.map((item) => <option value={item.pair} key={item.symbol} />)}</datalist><button className="button button-secondary" disabled={!comparison.trim()}>Compare</button></div>{comparisonResult && <p>{pair.pair}: {analytics?.periodChangePercent?.toFixed(2) ?? '—'}% · {comparisonResult.symbol}: {comparisonResult.periodChangePercent?.toFixed(2) ?? '—'}%</p>}</form></section><section className="forex-detail-card"><h2>Currency strength · daily</h2><p className="forex-method">Mean provider-reported daily pair returns. Each pair's return contributes to its base currency; its mathematically inverted return contributes to the quote currency. Only currencies represented by at least two major pairs appear.</p>{analytics?.currencyStrength?.length ? <div className="forex-strength-list">{analytics.currencyStrength.map((row) => <div key={row.currency}><span>{row.currency}<small>{row.pairCount} pairs</small></span><b className={row.averageContributionPercent >= 0 ? 'positive' : 'negative'}>{row.averageContributionPercent >= 0 ? '+' : ''}{money(row.averageContributionPercent)}%</b></div>)}</div> : <p>Currency strength will appear when enough real major-pair quotes are available.</p>}</section><section className="forex-detail-card"><h2>Pair details</h2><dl className="forex-pair-details"><dt>Base currency</dt><dd>{pair.baseName} ({pair.base})</dd><dt>Quote currency</dt><dd>{pair.quoteName} ({pair.quote})</dd><dt>Provider symbol</dt><dd>{pair.providerSymbol}</dd><dt>Market data</dt><dd>Twelve Data composite Forex</dd><dt>Volume</dt><dd>Not supplied for spot FX</dd></dl></section></div>
    {status === 'error' && message.includes('TWELVE_DATA_API_KEY') && <p className="forex-config-note">Set TWELVE_DATA_API_KEY in backend/.env and restart the backend to load Forex quotes and candles.</p>}
  </main>;
}
