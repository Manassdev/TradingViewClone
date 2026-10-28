import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, RefreshCw, Search, Star } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState, money } from '../components/Shared';
import { MarketOverviewChart, MarketOverviewHero } from '../components/MarketOverview';

const inr = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }) : '—';
const timeIST = (value) => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Time unavailable';

export default function IndiaMarket() {
  const { exchange: routeExchange } = useParams();
  const exchange = routeExchange === 'bse' ? 'BSE' : 'NSE';
  const { user } = useAuth();
  const requestSequence = useRef(0);
  const [instruments, setInstruments] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [indices, setIndices] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState('RELIANCE');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [quoteErrors, setQuoteErrors] = useState([]);
  const [favorites, setFavorites] = useState(new Set());
  const [busy, setBusy] = useState('');

  async function loadMarket(showSpinner = true) {
    const requestId = ++requestSequence.current;
    if (showSpinner) setLoading(true);
    setRefreshing(true);
    setError('');
    const [registry, indexQuotes, marketStatus] = await Promise.allSettled([api.indiaInstruments(exchange), api.indiaIndices(), api.indiaMarketStatus()]);
    if (requestId !== requestSequence.current) return;
    if (registry.status === 'fulfilled') setInstruments(registry.value.data || []);
    else setError(registry.reason?.message || 'Indian instruments could not be loaded.');
    const [marketQuotes] = await Promise.allSettled([registry.status === 'fulfilled' ? api.indiaQuotes(registry.value.data || []) : Promise.reject(registry.reason)]);
    if (requestId !== requestSequence.current) return;
    if (marketQuotes.status === 'fulfilled') { setQuotes(marketQuotes.value.data || []); setQuoteErrors(marketQuotes.value.errors || []); }
    else { setQuotes([]); setQuoteErrors([{ message: marketQuotes.reason?.message || 'Provider quote unavailable.' }]); }
    if (indexQuotes.status === 'fulfilled') setIndices(indexQuotes.value.data || []);
    if (marketStatus.status === 'fulfilled') setCalendar((marketStatus.value.data || []).find((row) => row.exchange === exchange) || null);
    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => { loadMarket(); return () => { requestSequence.current += 1; }; }, [exchange]);
  useEffect(() => {
    if (!user) { setFavorites(new Set()); return; }
    api.watchlists().then((result) => setFavorites(new Set((result.data || []).flatMap((list) => list.items || []).filter((item) => item.assetType?.startsWith('india_')).map((item) => `${item.exchange}:${item.symbol}`)))).catch(() => setFavorites(new Set()));
  }, [user]);
  const selectedInstrument = instruments.find((item) => item.symbol === selected) || instruments[0];
  const quoteByKey = useMemo(() => new Map(quotes.map((item) => [`${item.exchange}:${item.symbol}`, item])), [quotes]);
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return instruments.filter((item) => !text || `${item.symbol} ${item.name} ${item.exchange} ${item.sector}`.toLowerCase().includes(text));
  }, [instruments, query]);
  const selectedQuote = selectedInstrument && quoteByKey.get(`${exchange}:${selectedInstrument.symbol}`);
  const gainers = [...quotes].filter((item) => Number.isFinite(item.changePercent) && item.changePercent > 0 && !item.isStale).sort((a, b) => b.changePercent - a.changePercent);
  const losers = [...quotes].filter((item) => Number.isFinite(item.changePercent) && !item.isStale).sort((a, b) => a.changePercent - b.changePercent);
  const mostActive = [...quotes].filter((item) => Number.isFinite(item.volume) && !item.isStale).sort((a, b) => b.volume - a.volume);
  const sectors = [...quotes.reduce((map, quote) => {
    if (!Number.isFinite(quote.changePercent) || quote.isStale) return map;
    const entry = map.get(quote.sector) || { sector: quote.sector, sum: 0, constituents: 0 };
    entry.sum += quote.changePercent; entry.constituents += 1; map.set(quote.sector, entry); return map;
  }, new Map()).values()].map((entry) => ({ ...entry, averageChangePercent: entry.sum / entry.constituents })).sort((a, b) => b.averageChangePercent - a.averageChangePercent);

  useEffect(() => {
    if (!selectedInstrument) { setHistory([]); return; }
    const controller = new AbortController();
    setHistory([]);
    api.indiaCandles(exchange, selectedInstrument.symbol, '1D', 180, controller.signal)
      .then((result) => setHistory((result.data.candles || []).map((candle) => ({ time: Date.parse(candle.time), value: candle.close })).filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))))
      .catch(() => { if (!controller.signal.aborted) setHistory([]); });
    return () => controller.abort();
  }, [exchange, selectedInstrument?.symbol]);

  async function toggleWatchlist(instrument) {
    if (!user) { setError('Sign in to save Indian instruments to your watchlist.'); return; }
    const key = `${instrument.exchange}:${instrument.symbol}`;
    const assetType = instrument.assetType;
    setBusy(key); setError('');
    try {
      if (favorites.has(key)) {
        const lists = await api.watchlists();
        for (const list of lists.data || []) {
          const item = (list.items || []).find((row) => row.assetType === assetType && row.exchange === instrument.exchange && row.symbol === instrument.symbol);
          if (item) await api.removeFromWatchlist(item._id, list._id);
        }
        setFavorites((current) => { const next = new Set(current); next.delete(key); return next; });
      } else {
        await api.addToWatchlist({ symbol: instrument.symbol, assetType, exchange: instrument.exchange, provider: 'twelvedata', displayName: instrument.name });
        setFavorites((current) => new Set(current).add(key));
      }
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(''); }
  }

  return <main className="page-wrap page-content india-page market-overview-page">
    <MarketOverviewHero market="India" />
    <section className="market-overview-section">
      <div className="india-heading-row"><div><p className="eyebrow">Indian equities · {exchange}</p><h2 className="market-overview-section-title">Market summary</h2></div><div className="india-status"><span className={`india-status-dot ${calendar?.state === 'open' ? 'is-open' : ''}`} />{calendar?.state || 'unknown'} · Asia/Kolkata</div></div>
      <div className="india-index-grid">{indices.map((index) => <Link className="india-index-card" key={`${index.exchange}:${index.symbol}`} to={`/india/${index.exchange}/${index.symbol}`}><small>{index.exchange} · Index</small><b>{index.name}</b><strong>{inr(index.price)}</strong><span className={Number(index.changePercent) >= 0 ? 'positive' : 'negative'}>{Number.isFinite(index.changePercent) ? `${index.changePercent >= 0 ? '+' : ''}${money(index.changePercent)}%` : '—'} <small>daily</small></span><em>{index.isStale ? 'Stale EOD quote' : `EOD · ${timeIST(index.updatedAt)}`}</em></Link>)}{!indices.length && <div className="india-index-empty">Index data is not available from the configured provider or plan.</div>}</div>
      <div className="market-overview-panels india-overview-panels"><section className="market-overview-main-card"><header className="market-overview-chart-heading"><div><h3>{selectedInstrument?.name || 'Indian equities'}</h3><p>{exchange}:{selectedInstrument?.symbol || '—'} · Daily close · 180 sessions · Twelve Data</p></div><div className="market-overview-chart-price">{inr(selectedQuote?.price)}{selectedQuote && <small className={selectedQuote.changePercent >= 0 ? 'positive' : 'negative'}>{Number.isFinite(selectedQuote.changePercent) ? `${selectedQuote.changePercent >= 0 ? '+' : ''}${money(selectedQuote.changePercent)}% today` : 'Change unavailable'}</small>}</div></header><MarketOverviewChart data={history} loading={loading} color={history.length > 1 && history.at(-1).value >= history[0].value ? '#00a784' : '#f23645'} precision={2} timezone="Asia/Kolkata" label={`${selectedInstrument?.name || 'India instrument'} EOD price history`} /><footer className="market-overview-chart-footer"><span>180 daily candles · INR</span>{selectedInstrument && <Link to={`/india/${exchange}/${selectedInstrument.symbol}`}>Open full chart <ArrowUpRight size={13} /></Link>}</footer></section>
        <aside className="market-overview-aside"><section className="market-overview-side-card"><h3>Top daily gainers · {exchange} sample</h3>{gainers.length ? gainers.slice(0, 5).map((item) => <Link to={`/india/${item.exchange}/${item.symbol}`} key={`${item.exchange}:${item.symbol}`}><span><b>{item.symbol}</b><small>{item.name}</small></span><strong className="positive">+{money(item.changePercent)}%</strong></Link>) : <p>{quoteErrors[0]?.message || 'No positive daily moves in available quotes.'}</p>}</section><section className="market-overview-side-card"><h3>Top daily losers · {exchange} sample</h3>{losers.filter((item) => item.changePercent < 0).slice(0, 5).map((item) => <Link to={`/india/${item.exchange}/${item.symbol}`} key={`${item.exchange}:${item.symbol}`}><span><b>{item.symbol}</b><small>{item.name}</small></span><strong className="negative">{money(item.changePercent)}%</strong></Link>)}{!losers.some((item) => item.changePercent < 0) && <p>No negative daily moves in available quotes.</p>}</section><section className="market-overview-side-card"><h3>Most active · provider volume</h3>{mostActive.slice(0, 5).map((item) => <Link to={`/india/${item.exchange}/${item.symbol}`} key={`${item.exchange}:${item.symbol}`}><span><b>{item.symbol}</b><small>{item.name}</small></span><strong>{Number(item.volume).toLocaleString('en-IN')}</strong></Link>)}{!mostActive.length && <p>Volume rankings are unavailable unless the provider supplies volume.</p>}</section></aside></div>
      <p className="market-overview-disclaimer">Indian quotes are provider-reported end-of-day prices, not live or intraday quotes. Exchange holidays and special sessions depend on the operator-maintained calendar. Prices and availability depend on your Twelve Data plan.</p>
    </section>
    <section className="india-equities-section"><header className="india-equities-toolbar"><div><h2>Indian equities</h2><p>Search by company, symbol or exchange.</p></div><div className="india-controls"><div className="india-exchange-tabs"><Link className={exchange === 'NSE' ? 'active' : ''} to="/markets/india/nse">NSE</Link><Link className={exchange === 'BSE' ? 'active' : ''} to="/markets/india/bse">BSE</Link></div><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Indian stocks" aria-label="Search Indian stocks" /></label><button className="button button-secondary" onClick={() => loadMarket(false)} disabled={refreshing}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh</button></div></header>
      {error && <p className="india-error" role="alert">{error}</p>}{loading ? <LoadingState label="Loading Indian market data…" /> : error && !instruments.length ? <ErrorState message={error} onRetry={() => loadMarket()} /> : <div className="india-table-wrap"><table className="india-table"><thead><tr><th>Instrument</th><th>Exchange</th><th>Price</th><th>Change</th><th>Volume</th><th>Updated · IST</th><th /></tr></thead><tbody>{visible.map((instrument) => { const quote = quoteByKey.get(`${instrument.exchange}:${instrument.symbol}`); const up = Number(quote?.changePercent) >= 0; const key = `${instrument.exchange}:${instrument.symbol}`; return <tr key={key}><td><Link to={`/india/${exchange}/${instrument.symbol}`} onClick={() => setSelected(instrument.symbol)}><b>{instrument.symbol}</b><small>{instrument.name}</small></Link></td><td>{instrument.exchange}<small>{instrument.sector}</small></td><td>{inr(quote?.price)}{quote?.isStale && <small className="india-stale">Stale</small>}</td><td className={quote && Number.isFinite(quote.changePercent) ? up ? 'positive' : 'negative' : ''}>{quote && Number.isFinite(quote.changePercent) ? <>{up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{up ? '+' : ''}{money(quote.changePercent)}%</> : '—'}</td><td>{Number.isFinite(quote?.volume) ? Number(quote.volume).toLocaleString('en-IN') : '—'}</td><td>{quote ? timeIST(quote.updatedAt) : quoteErrors[0]?.message || 'Unavailable'}</td><td><button className={`india-favorite ${favorites.has(key) ? 'selected' : ''}`} onClick={() => toggleWatchlist(instrument)} disabled={busy === key} aria-label={`${favorites.has(key) ? 'Remove' : 'Add'} ${instrument.symbol} ${favorites.has(key) ? 'from' : 'to'} watchlist`}><Star size={15} fill={favorites.has(key) ? 'currentColor' : 'none'} /></button></td></tr>; })}{!visible.length && <tr><td colSpan="7">No instruments match this search.</td></tr>}</tbody></table></div>}
      {quoteErrors.length > 0 && <p className="india-data-note" role="status">Some symbols could not be fetched: {quoteErrors.slice(0, 4).map((item) => `${item.exchange || ''}:${item.symbol || ''}`).join(', ')}. Check the Twelve Data entitlement for India EOD and each exchange.</p>}
      <section className="india-sector-section"><h3>Sector performance · sample mean</h3><div className="india-sector-grid">{sectors.map((sector) => <div key={sector.sector}><span>{sector.sector}<small>{sector.constituents} sample instruments</small></span><b className={sector.averageChangePercent >= 0 ? 'positive' : 'negative'}>{sector.averageChangePercent >= 0 ? '+' : ''}{money(sector.averageChangePercent)}%</b></div>)}{!sectors.length && <p>Sector performance needs current provider quotes.</p>}</div><small>Unweighted mean of provider-reported daily percentage changes for available instruments in this exchange's configured sample; not official sector-index performance.</small></section>
    </section>
  </main>;
}
