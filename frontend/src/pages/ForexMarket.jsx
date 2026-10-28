import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, RefreshCw, Search, Star } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, formatDate, LoadingState, money } from '../components/Shared';
import { MarketOverviewChart, MarketOverviewHero } from '../components/MarketOverview';

const categories = [['all', 'All pairs'], ['major', 'Majors'], ['minor', 'Minors'], ['exotic', 'Exotics']];
const RECENT_KEY = 'tv_forex_recent';

function readRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((item) => typeof item === 'string'); }
  catch { return []; }
}

export default function ForexMarket() {
  const { user } = useAuth();
  const [pairs, setPairs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [quoteErrors, setQuoteErrors] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [recent, setRecent] = useState(readRecent);
  const [category, setCategory] = useState('major');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [busySymbol, setBusySymbol] = useState('');
  const [selectedSymbol, setSelectedSymbol] = useState('EURUSD');
  const [history, setHistory] = useState([]);
  const [historyStatus, setHistoryStatus] = useState('loading');
  const [chartReload, setChartReload] = useState(0);

  const load = useCallback(async (nextCategory = category) => {
    setStatus('loading');
    setError('');
    try {
      const pairResult = await api.forexPairs();
      const allPairs = pairResult.data || [];
      setPairs(allPairs);
      const selectedPairs = allPairs.filter((pair) => nextCategory === 'all' || pair.category === nextCategory);
      const quoteResult = await api.forexQuotes(selectedPairs.map((pair) => pair.symbol));
      setQuotes(quoteResult.data || []);
      setQuoteErrors(quoteResult.errors || []);
      setStatus('ready');
    } catch (requestError) {
      setStatus('error');
      setError(requestError.message);
    }
  }, [category]);

  useEffect(() => { load('major'); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    setHistoryStatus('loading');
    api.forexCandles(selectedSymbol, '1D', 180, controller.signal).then((result) => {
      setHistory((result.data.candles || []).map((candle) => ({ time: Date.parse(candle.time), value: candle.close })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value)));
      setHistoryStatus('ready');
    }).catch((requestError) => { if (requestError.name !== 'AbortError') { setHistory([]); setHistoryStatus('error'); } });
    return () => controller.abort();
  }, [selectedSymbol, chartReload]);
  useEffect(() => {
    if (!user) { setFavorites(new Set()); return; }
    api.watchlists().then((result) => {
      const items = (result.data || []).flatMap((list) => list.items || []);
      setFavorites(new Set(items.filter((item) => item.assetType === 'forex').map((item) => item.symbol)));
    }).catch(() => setFavorites(new Set()));
  }, [user]);

  const quoteBySymbol = useMemo(() => new Map(quotes.map((quote) => [quote.symbol, quote])), [quotes]);
  const visiblePairs = useMemo(() => pairs.filter((pair) => {
    const categoryMatch = category === 'all' || pair.category === category;
    const text = query.trim().toUpperCase();
    const queryMatch = !text || pair.symbol.includes(text.replace(/[\s/_-]/g, '')) || pair.pair.includes(text) || pair.base.includes(text) || pair.quote.includes(text) || pair.name.toUpperCase().includes(text) || pair.baseName.toUpperCase().includes(text) || pair.quoteName.toUpperCase().includes(text);
    return categoryMatch && queryMatch;
  }), [pairs, category, query]);

  const recentPairs = recent.map((symbol) => pairs.find((pair) => pair.symbol === symbol)).filter(Boolean).slice(0, 6);
  const sorted = [...quotes].filter((quote) => Number.isFinite(quote.changePercent));
  const mostActive = [...sorted].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 3);
  const summaryPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF'].map((symbol) => pairs.find((pair) => pair.symbol === symbol)).filter(Boolean);
  const selectedPair = pairs.find((pair) => pair.symbol === selectedSymbol);
  const selectedQuote = quoteBySymbol.get(selectedSymbol);
  const historyUp = history.length > 1 && history.at(-1).value >= history[0].value;

  async function toggleFavorite(pair) {
    if (!user) { setError('Sign in to save Forex pairs to your watchlist.'); return; }
    const exists = favorites.has(pair.symbol);
    setBusySymbol(pair.symbol);
    setError('');
    try {
      if (exists) {
        const result = await api.watchlists();
        const lists = result.data || [];
        for (const list of lists) {
          const item = (list.items || []).find((row) => row.assetType === 'forex' && row.symbol === pair.symbol);
          if (item) await api.removeFromWatchlist(item._id, list._id);
        }
        setFavorites((current) => { const next = new Set(current); next.delete(pair.symbol); return next; });
      } else {
        await api.addToWatchlist({ symbol: pair.symbol, assetType: 'forex', exchange: 'FX', provider: 'twelvedata', displayName: pair.pair });
        setFavorites((current) => new Set(current).add(pair.symbol));
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusySymbol(''); }
  }

  return <main className="page-wrap page-content forex-page market-overview-page"><MarketOverviewHero market="Forex" />
    <section className="market-overview-section"><h2 className="market-overview-section-title">Currency pairs <ChevronRight size={18} aria-hidden="true" /></h2>
      <div className="market-summary-pills forex-summary-pills">{summaryPairs.map((pair) => { const quote = quoteBySymbol.get(pair.symbol); const up = Number(quote?.changePercent) >= 0; return <button key={pair.symbol} className={`market-summary-pill ${selectedSymbol === pair.symbol ? 'active' : ''}`} onClick={() => setSelectedSymbol(pair.symbol)}><span className="forex-pair-avatar market-summary-avatar">{pair.base.slice(0, 1)}</span><span className="market-summary-copy"><b>{pair.pair}</b><span>{quote ? money(quote.rate, pair.quote === 'JPY' ? 3 : 5) : '—'} <small>{pair.quote}</small><em className={quote ? up ? 'positive' : 'negative' : ''}>{quote && Number.isFinite(quote.changePercent) ? `${up ? '+' : ''}${money(quote.changePercent)}%` : '—'}</em></span></span></button>; })}</div>
      <div className="market-overview-panels"><section className="market-overview-main-card"><header className="market-overview-chart-heading"><div><h3>{selectedPair?.pair || selectedSymbol} exchange rate</h3><p>Daily close · 180 days · Twelve Data</p></div><div className="market-overview-chart-price">{selectedQuote ? money(selectedQuote.rate, selectedPair?.quote === 'JPY' ? 3 : 5) : '—'}{selectedQuote && <small className={Number(selectedQuote.changePercent) >= 0 ? 'positive' : 'negative'}>{Number(selectedQuote.changePercent) >= 0 ? '+' : ''}{money(selectedQuote.changePercent)}% daily</small>}</div></header><MarketOverviewChart data={history} loading={historyStatus === 'loading'} color={historyUp ? '#00a784' : '#f23645'} precision={selectedPair?.quote === 'JPY' ? 3 : 5} label={`${selectedSymbol} daily Forex exchange rate`} /><footer className="market-overview-chart-footer"><span>6 months</span><Link to={`/forex/${selectedSymbol}`}>Open full chart <ArrowRight size={13} /></Link></footer></section>
        <aside className="market-overview-aside"><section className="market-overview-side-card"><h3>Largest daily moves</h3>{mostActive.length ? mostActive.map((quote) => { const up = quote.changePercent >= 0; return <Link to={`/forex/${quote.symbol}`} key={quote.symbol}><span><b>{quote.pair}</b><small>{money(quote.rate, quote.quote === 'JPY' ? 3 : 5)} {quote.quote}</small></span><strong className={up ? 'positive' : 'negative'}>{up ? '+' : ''}{money(quote.changePercent)}%</strong></Link>; }) : <p>Quote data unavailable</p>}</section><section className="market-overview-side-card"><h3>Daily range · major pairs</h3>{summaryPairs.slice(0, 3).map((pair) => { const quote = quoteBySymbol.get(pair.symbol); return <Link to={`/forex/${pair.symbol}`} key={pair.symbol}><span><b>{pair.pair}</b><small>{quote?.sessionStatus || 'Session unavailable'}</small></span><strong>{quote?.high != null && quote?.low != null ? `${money(quote.low, pair.quote === 'JPY' ? 3 : 5)} – ${money(quote.high, pair.quote === 'JPY' ? 3 : 5)}` : '—'}</strong></Link>; })}</section></aside>
      </div>
      <p className="market-overview-disclaimer">Rates and history use Twelve Data composite Forex data; real-time or delayed access depends on your plan. They may not be executable broker prices. Bid/ask and spread appear only when the provider returns them.</p>
    </section>
    {recentPairs.length > 0 && <section className="forex-recent"><h2>Recently viewed</h2><div>{recentPairs.map((pair) => <Link key={pair.symbol} to={`/forex/${pair.symbol}`}>{pair.pair}<small>{pair.name}</small></Link>)}</div></section>}
    <div className="market-toolbar forex-toolbar"><div className="search-field"><Search size={15} /><input id="forex-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search EUR/USD, EUR, or Euro" aria-label="Search Forex pairs" /></div><div className="forex-category-tabs" role="group" aria-label="Filter Forex pairs">{categories.map(([value, label]) => <button key={value} className={category === value ? 'active' : ''} aria-pressed={category === value} onClick={() => { setCategory(value); load(value); }}>{label}</button>)}</div><button className="button button-secondary" onClick={() => { load(); setChartReload((value) => value + 1); }} disabled={status === 'loading'}><RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} /> Refresh</button></div>
    {error && <p className="forex-error" role="alert">{error}</p>}
    {quoteErrors.length > 0 && <p className="forex-error" role="status">Some pairs could not be quoted: {quoteErrors.map((item) => item.symbol).join(', ')}. Check provider limits or pair entitlement.</p>}
    {status === 'loading' && !pairs.length ? <LoadingState label="Loading Forex instruments…" /> : status === 'error' && !pairs.length ? <ErrorState message={error || 'Forex market data is unavailable.'} onRetry={() => load()} /> : !visiblePairs.length ? <EmptyState title="No Forex pairs found" message={category === 'exotic' ? 'Configure additional pairs with FOREX_EXTRA_PAIRS in backend/.env.' : 'Try another symbol or currency name.'} /> : <div className="market-table-wrap forex-table-wrap"><table className="market-table forex-table"><thead><tr><th>Pair</th><th>Rate</th><th>Daily change</th><th>Bid / Ask</th><th>Spread</th><th>Session</th><th>Updated</th><th>Watchlist</th></tr></thead><tbody>{visiblePairs.map((pair) => {
      const quote = quoteBySymbol.get(pair.symbol);
      const up = Number(quote?.changePercent) >= 0;
      return <tr key={pair.symbol}><td><Link className="market-asset" to={`/forex/${pair.symbol}`}><span className="forex-pair-avatar">{pair.base.slice(0, 1)}</span><span><b>{pair.pair}</b><small>{pair.name}</small></span></Link></td><td className="table-strong">{quote ? money(quote.rate, pair.quote === 'JPY' ? 3 : 5) : '—'}</td><td className={quote && Number.isFinite(quote.changePercent) ? up ? 'positive' : 'negative' : ''}>{quote && Number.isFinite(quote.changePercent) ? <>{up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{up ? '+' : ''}{money(quote.changePercent, 2)}%</> : '—'}</td><td>{quote?.bid && quote?.ask ? `${money(quote.bid, 5)} / ${money(quote.ask, 5)}` : '—'}</td><td>{quote?.spread ? money(quote.spread, 5) : '—'}</td><td>{quote?.sessionStatus || '—'}{quote?.isStale && <small className="forex-stale">Stale</small>}</td><td>{quote?.updatedAt ? formatDate(quote.updatedAt) : '—'}</td><td><button className={`forex-favorite ${favorites.has(pair.symbol) ? 'selected' : ''}`} title={favorites.has(pair.symbol) ? 'Remove from watchlist' : 'Add to watchlist'} aria-label={favorites.has(pair.symbol) ? `Remove ${pair.pair} from watchlist` : `Add ${pair.pair} to watchlist`} disabled={busySymbol === pair.symbol} onClick={() => toggleFavorite(pair)}><Star size={15} fill={favorites.has(pair.symbol) ? 'currentColor' : 'none'} /></button></td></tr>;
    })}</tbody></table><p className="table-disclaimer">Rates are provider composite prices, not broker-executable quotes. Real-time or delayed access depends on your Twelve Data plan. Bid/ask and spread display only when returned by the provider. Forex spot volume is not available and is not shown.</p></div>}
  </main>;
}

