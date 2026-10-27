import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '../services/api';
import { formatDate, money, Sparkline } from './Shared';

const ideaFilters = [
  ['all', 'All Ideas'], ['bullish', 'Bullish'], ['bearish', 'Bearish'], ['breakout', 'Breakout'], ['moving-average', 'Moving Average']
];

function matchesFilter(idea, filter) {
  const kind = String(idea.kind || '').toLowerCase();
  if (filter === 'bullish' || filter === 'bearish') return idea.signal === filter;
  if (filter === 'breakout') return kind.includes('breakout') || kind.includes('breakdown');
  if (filter === 'moving-average') return kind.includes('sma') || kind.includes('moving-average');
  return true;
}

function IdeaCard({ idea }) {
  const bullish = idea.signal === 'bullish';
  const pair = idea.symbol || '';
  const candlePoints = Array.isArray(idea.chartData) ? idea.chartData : [];
  const kindLabel = String(idea.kind || '').replaceAll('-', ' ');
  return <article className="idea-card dynamic-idea-card">
    <div className="idea-card-header"><div className="idea-card-asset"><span className="idea-asset-symbol" aria-hidden="true">{pair.replace(/USDT$/, '').slice(0, 3)}</span><div className="idea-asset-details"><strong className="idea-asset-name">{pair.replace(/USDT$/, '')}</strong><span className="idea-trading-pair">{pair.replace(/USDT$/, '')} / USDT · {idea.source || 'Market data'}</span></div></div><span className={`idea-signal-badge ${idea.signal}`}>{bullish ? 'Bullish' : 'Bearish'}</span></div>
    <h3 className="idea-title">{idea.title}</h3>
    <div className="idea-chart-preview"><span className="idea-chart-label">Completed {idea.interval || '—'} closes</span><Sparkline className={`idea-chart-svg ${bullish ? 'bullish' : 'bearish'}`} data={candlePoints} positive={bullish} style={{ height: 84 }} /><span className="idea-chart-data-count">{candlePoints.length ? `${candlePoints.length} completed candles · ${idea.source || 'Market'}` : 'Chart preview unavailable'}</span></div>
    <div className="idea-card-body"><div className="idea-price-row"><span className="idea-price-label">Latest market price</span><strong className="idea-market-price">${money(idea.price, 4)}<span className="idea-price-quote"> USDT</span></strong></div><div className="idea-card-facts"><span className="idea-kind-pill">{kindLabel}</span><span className="idea-timeframe">Signal timeframe · {idea.interval || '—'}</span></div>{idea.description && <div className="idea-rationale"><span className="idea-rationale-label">Reason for signal</span><p className="idea-summary">{idea.description}</p></div>}<div className="idea-card-footer"><div className="idea-card-timestamps">{idea.generatedAt && <span>Generated <time dateTime={idea.generatedAt}>{formatDate(idea.generatedAt)}</time></span>}{idea.priceTimestamp && <span>Price updated <time dateTime={idea.priceTimestamp}>{formatDate(idea.priceTimestamp)}</time></span>}</div><Link className="idea-view-analysis" to={`/ideas/${encodeURIComponent(idea.id)}`}>View Analysis <ArrowRight size={13} /></Link></div></div>
  </article>;
}

function IdeaFeedback({ state, title, message, action }) {
  return <article className="idea-feedback-card" data-state={state}><span className="idea-feedback-mark">{state === 'loading' ? '···' : '—'}</span><h3 className="idea-feedback-title">{title}</h3><p className="idea-feedback-message">{message}</p>{action && <button className="idea-refresh-button" type="button" onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}</article>;
}

export function CommunityIdeas() {
  const [ideas, setIdeas] = useState([]);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading');
  const [filter, setFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (lock.current) return;
    lock.current = true;
    if (!quiet) setStatus(ideas.length ? 'ready' : 'loading');
    if (ideas.length) setRefreshing(true);
    try {
      const response = await api.ideas();
      setIdeas(Array.isArray(response.data) ? response.data : []);
      setMeta(response.meta || null);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMeta((value) => ({ ...value, error: error.message }));
    } finally { lock.current = false; setRefreshing(false); }
  }, [ideas.length]);
  useEffect(() => { load(); const timer = window.setInterval(() => load({ quiet: true }), 60_000); return () => window.clearInterval(timer); }, []);

  const filtered = ideas.filter((idea) => matchesFilter(idea, filter));
  return <section className="ideas-section" id="community-ideas" aria-labelledby="community-ideas-title">
    <div className="ideas-title-header"><div><p className="community-ideas-eyebrow">BINANCE MARKET SIGNALS</p><h2 className="section-title" id="community-ideas-title">Community ideas</h2></div><div className="ideas-filter-chips" role="group" aria-label="Filter community ideas">{ideaFilters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={`idea-chip ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}</button>)}<button className="idea-chip idea-filter-refresh" aria-label="Refresh ideas" type="button" disabled={refreshing} onClick={() => load()}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button></div></div>
    <p className="community-ideas-disclaimer">Rule-based technical analysis from Binance market data. Signals are examples, not predictions or investment advice.</p>
    {status === 'loading' && !ideas.length ? <p className="community-ideas-status" role="status">Loading cryptocurrency ideas…</p> : status === 'error' && !ideas.length ? <IdeaFeedback state="error" title="Ideas temporarily unavailable" message={meta?.error || 'Market signals could not be loaded. Please try again.'} action={{ label: 'Refresh ideas', onClick: () => load() }} /> : !filtered.length ? <IdeaFeedback state="empty" title="No matching ideas" message={ideas.length ? 'No signals match the selected filter right now. Choose another filter or refresh the market data.' : 'No signals currently match the available market data.'} action={{ label: refreshing ? 'Refreshing…' : 'Refresh ideas', onClick: () => load(), disabled: refreshing }} /> : <div className="ideas-grid-wrapper"><div className="ideas-grid" aria-live="polite">{filtered.map((idea) => <IdeaCard key={idea.id} idea={idea} />)}</div></div>}
    {status === 'error' && ideas.length > 0 && <p className="community-ideas-status" role="status" data-state="error">Refresh failed. Showing the latest successfully loaded signals.</p>}
    {meta?.generatedAt && <p className="community-ideas-disclaimer">Signal data generated {formatDate(meta.generatedAt)}. Price timestamps are shown on each idea.</p>}
  </section>;
}

const newsFilters = [
  ['all', 'All News'], ['cryptocurrency', 'Crypto'], ['stock_market', 'Stock Market'], ['economy', 'Economy'], ['regulation', 'Regulation']
];

function safeExternalUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function NewsCard({ article }) {
  const href = safeExternalUrl(article.url);
  const image = safeExternalUrl(article.imageUrl);
  return <article className="community-news-card">
    {image && <a className="community-news-image-wrap" href={href || undefined} target="_blank" rel="noopener noreferrer" tabIndex={href ? 0 : -1}><img className="community-news-image" src={image} alt="" loading="lazy" onError={(event) => { event.currentTarget.closest('.community-news-image-wrap')?.remove(); }} /></a>}
    <div className="community-news-card-body"><div className="community-news-card-meta"><span className="community-news-category">{article.categoryLabel || article.category || 'News'}</span><time dateTime={article.publishedAt || undefined}>{formatDate(article.publishedAt)}</time></div><h3 className="community-news-title">{article.headline || 'Headline unavailable'}</h3>{article.summary && <p className="community-news-summary">{article.summary}</p>}<div className="news-card-footer"><span>{article.publisher || 'Publisher unavailable'}</span>{href ? <a className="community-news-read" href={href} target="_blank" rel="noopener noreferrer">Read article <ExternalLink size={13} /></a> : <span className="invalid-link-note">Article link unavailable</span>}</div></div>
  </article>;
}

export function CommunityNews() {
  const [category, setCategory] = useState('all');
  const [articles, setArticles] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async (nextCategory = category, quiet = false) => {
    if (lock.current) return;
    lock.current = true;
    if (!quiet) { setStatus('loading'); setError(''); }
    try {
      const response = await api.news(nextCategory);
      const data = Array.isArray(response.data) ? response.data : [];
      const unique = new Map();
      for (const article of data) {
        const key = article.id || article.url || article.headline;
        if (key && !unique.has(key)) unique.set(key, article);
      }
      setArticles([...unique.values()].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)));
      setStatus('ready');
    } catch (requestError) { setError(requestError.message); setStatus('error'); }
    finally { lock.current = false; setRefreshing(false); }
  }, [category]);
  useEffect(() => { load(category); const timer = window.setInterval(() => load(category, true), 15 * 60_000); return () => window.clearInterval(timer); }, [category]);
  function selectCategory(next) { if (next === category) return; setCategory(next); setRefreshing(true); }

  return <section className="community-news-section" id="community" aria-labelledby="community-news-title">
    <div className="community-news-header"><div><p className="community-news-eyebrow">MARKET COVERAGE</p><h2 className="section-title" id="community-news-title">Community news</h2></div><div className="community-news-filters" role="group" aria-label="Filter community news by category">{newsFilters.map(([key, label]) => <button key={key} type="button" aria-pressed={category === key} className={`community-news-filter ${category === key ? 'active' : ''}`} onClick={() => selectCategory(key)}>{label}</button>)}<button type="button" aria-label="Refresh news" className="community-news-filter" disabled={refreshing} onClick={() => load(category)}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button></div></div>
    <p className="community-news-disclosure">News from GNews. The free plan may provide articles with up to a 12-hour delay. Publication time is supplied by the publisher; retrieval time is shown separately.</p>
    {status === 'loading' ? <p className="community-news-status" role="status">Loading community news…</p> : status === 'error' ? <div className="community-news-status" data-state="error" role="alert">{error || 'News is temporarily unavailable.'} <button className="community-news-read" onClick={() => load(category)}>Try again</button></div> : !articles.length ? <div className="community-news-status" role="status">The provider returned no articles for this category. Try another filter or refresh later. <button className="community-news-read" onClick={() => load(category)}>Refresh news</button></div> : <div className="community-news-grid">{articles.map((article) => <NewsCard key={article.id || article.url} article={article} />)}</div>}
    {status === 'ready' && articles.length > 0 && <Link className="community-news-read" to="/markets/crypto">Explore market data <ArrowRight size={13} /></Link>}
  </section>;
}
