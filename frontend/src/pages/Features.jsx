import { useEffect, useState } from 'react';
import { ArrowRight, Bell, CandlestickChart, ChartNoAxesCombined, ChevronDown, Code2, Globe2, Layers3, Search, ShieldCheck, SlidersHorizontal, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router';
import './features.css';

const categories = [
  ['charts', 'Charts'], ['alerts', 'Alerts'], ['financials', 'Financials'], ['pine-script', 'Pine Script'],
  ['trading', 'Trading'], ['screeners', 'Screeners'], ['macroeconomics', 'Macroeconomics'],
  ['yield-curves', 'Yield Curves'], ['options', 'Options'], ['markets', 'Markets'], ['community', 'Community'], ['news', 'News']
];

const candles = [42,38,44,48,43,51,58,54,62,57,66,61,55,59,68,73,69,77,71,65,72,80,75,83,79,87,82,90,85,92,88,97,91,100,95,103,98,110,104,112];
const chartLine = '0,76 30,72 60,79 90,61 120,66 150,55 180,63 210,42 240,49 270,35 300,40 330,25 360,31 390,19 420,27 450,12 480,18 510,9 540,16 570,4';

function CandleSvg({ compact = false }) {
  const width = compact ? 340 : 740;
  const height = compact ? 170 : 290;
  const unit = width / candles.length;
  return <svg className="feature-candles" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Illustrative candlestick chart">
    {[.2, .4, .6, .8].map((value) => <line key={value} x1="0" x2={width} y1={height * value} y2={height * value} className="chart-gridline" />)}
    {candles.map((close, index) => {
      const open = candles[Math.max(0, index - 1)] + (index % 3 === 0 ? 8 : -5);
      const high = Math.max(open, close) + 9 + (index % 4);
      const low = Math.min(open, close) - 7 - (index % 3);
      const y = (price) => height - ((price - 24) / 104) * (height - 16) - 8;
      const up = close >= open;
      const color = up ? '#22c997' : '#ef5360';
      const x = index * unit + unit * .24;
      return <g key={index} stroke={color} fill={color} opacity=".92"><line x1={x + unit * .27} x2={x + unit * .27} y1={y(high)} y2={y(low)} strokeWidth={compact ? 1 : 1.25} /><rect x={x} y={Math.min(y(open), y(close))} width={unit * .55} height={Math.max(2, Math.abs(y(open) - y(close)))} rx="1" /></g>;
    })}
    <polyline points={chartLine} transform={`translate(0 ${height - 74}) scale(${width / 570} .54)`} fill="none" stroke="#8a71ff" strokeWidth="2" opacity=".8" />
  </svg>;
}

function ChartWindow({ title = 'BTCUSD · 1D', compact = false, children }) {
  return <div className={`feature-chart-window ${compact ? 'compact' : ''}`}>
    <div className="feature-chart-toolbar"><div className="feature-chart-brand"><span className="tv-symbol">TV</span><b>{title}</b><small>1D</small></div><div className="feature-chart-tools"><span>Indicators</span><span>Alert</span><span>Replay</span><span className="chart-window-dot" /></div></div>
    {children || <div className="feature-chart-body"><div className="feature-chart-prices"><b>80,922.04</b><span className="feature-positive">+1.12%</span><small>O 79,841.22&nbsp; H 81,204.10&nbsp; L 79,455.38&nbsp; C 80,922.04</small></div><div className="feature-chart-plot"><CandleSvg compact={compact} /><div className="chart-axis">84,000.00<br /><br />82,000.00<br /><br />80,000.00<br /><br />78,000.00</div></div><div className="feature-volume-bars">{candles.slice(0, 30).map((value, index) => <span key={index} style={{ height: `${13 + (value % 35)}px`, background: index % 4 ? '#167e70' : '#963d4a' }} />)}</div><div className="feature-time-axis"><span>Oct 08</span><span>Oct 12</span><span>Oct 16</span><span>Oct 20</span><span>Oct 24</span><span>Oct 28</span></div></div>}
  </div>;
}

function SuperchartPreview({ multi = false }) {
  return <div className={`feature-terminal ${multi ? 'multi-chart' : ''}`}>
    <div className="feature-terminal-top"><span className="terminal-lights"><i /><i /><i /></span><b>Supercharts</b><div className="terminal-tabs"><span>BTCUSD</span><span>Indicators</span><span>Alert</span><span>Replay</span></div><span className="terminal-share">Publish</span></div>
    {multi ? <div className="feature-multi-grid">{['NASDAQ · AAPL', 'NASDAQ · NVDA', 'BINANCE · BTCUSDT', 'NASDAQ · TSLA'].map((name, index) => <ChartWindow key={name} title={name} compact><div className="mini-chart"><div className="mini-chart-label"><b>{name}</b><span className={index === 1 ? 'feature-negative' : 'feature-positive'}>{index === 1 ? '−1.24%' : '+1.82%'}</span></div><CandleSvg compact /></div></ChartWindow>)}</div> : <div className="feature-terminal-content"><div className="terminal-tool-rail">{['＋', '╱', '⌖', '⌁', 'T', '◯', '⌂'].map((tool) => <span key={tool}>{tool}</span>)}</div><ChartWindow /><aside className="terminal-watchlist"><div className="watchlist-head"><b>Watchlist</b><span>⋯</span></div>{[['AAPL', '227.52', '+1.18%'], ['NVDA', '141.98', '+0.62%'], ['TSLA', '339.11', '−0.44%'], ['MSFT', '514.20', '+0.88%'], ['BTCUSD', '80,922', '+1.12%']].map(([name, value, change]) => <div key={name}><b>{name}</b><span>{value}</span><small className={change.startsWith('−') ? 'feature-negative' : 'feature-positive'}>{change}</small></div>)}</aside></div>}
    <span className="illustrative-label">Illustrative interface · sample values</span>
  </div>;
}

function FeatureButton({ to, children, secondary = false }) {
  return <Link className={`feature-cta ${secondary ? 'secondary' : ''}`} to={to}>{children}<ArrowRight size={15} /></Link>;
}

function CategoryNav({ active, onSelect }) {
  return <nav className="features-category-nav" aria-label="Feature categories"><div className="features-category-track">{categories.map(([id, label]) => <a href={`#${id}`} className={active === id ? 'active' : ''} key={id} onClick={(event) => { event.preventDefault(); onSelect(id); document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); }}>{label}</a>)}</div></nav>;
}

function FeatureSection({ id, eyebrow, title, description, visual, reverse = false, className = '', children }) {
  return <section id={id} className={`feature-section ${reverse ? 'reverse' : ''} ${className}`}>
    <div className="feature-section-copy"><p className="feature-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p>{children}</div>
    <div className="feature-section-visual">{visual}</div>
  </section>;
}

function ScreenerVisual() {
  const [tab, setTab] = useState('Stocks');
  const rows = tab === 'Crypto' ? [['BTC', 'Bitcoin', '$80,922', '+1.12%'], ['ETH', 'Ethereum', '$2,356', '+1.53%'], ['SOL', 'Solana', '$101.72', '+1.16%']] : [['NVDA', 'NVIDIA Corporation', '$141.98', '+0.62%'], ['AAPL', 'Apple Inc.', '$227.52', '+1.18%'], ['MSFT', 'Microsoft Corp.', '$514.20', '+0.88%']];
  return <div className="screener-window"><div className="screener-top"><b><SlidersHorizontal size={15} /> {tab} screener</b><button aria-label="Open screener filters"><Search size={14} /></button></div><div className="screener-tabs">{['Stocks', 'ETF', 'Crypto'].map((item) => <button className={tab === item ? 'active' : ''} onClick={() => setTab(item)} key={item}>{item}</button>)}</div><div className="screener-filters"><span>Market <b>United States⌄</b></span><span>Price <b>Above $10⌄</b></span><span>Change % <b>Positive⌄</b></span></div><div className="screener-table"><div className="screener-row heading"><span>Symbol</span><span>Price</span><span>Change %</span></div>{rows.map(([symbol, name, price, change]) => <div className="screener-row" key={symbol}><span><b>{symbol}</b><small>{name}</small></span><b>{price}</b><strong className="feature-positive">{change}</strong></div>)}</div><p className="illustrative-label">Illustrative table · sample values</p></div>;
}

function PineEditorVisual() {
  const lines = ['indicator("Momentum map", overlay=true)', 'fast = ta.ema(close, 12)', 'slow = ta.ema(close, 26)', 'momentum = fast - slow', '', 'plot(fast, color=color.aqua)', 'plot(slow, color=color.purple)', 'bgcolor(momentum > 0 ?', '  color.new(color.green, 92) :', '  color.new(color.red, 92))'];
  return <div className="pine-window"><div className="pine-chart"><div className="pine-head"><b>BTCUSD · 1D</b><span>+2.16%</span></div><div className="pine-plot"><CandleSvg compact /></div><div className="pine-indicator">Momentum&nbsp; <span>0.62</span><div><i /></div></div></div><div className="pine-editor"><div className="pine-editor-head"><Code2 size={13} /> Pine Editor <span>⌃</span></div><div className="pine-code">{lines.map((line, index) => <div key={index}><i>{index + 1}</i><code className={line.includes('indicator') || line.includes('plot') ? 'code-purple' : line.includes('ta.') || line.includes('color.') ? 'code-blue' : line.includes('=') ? 'code-green' : ''}>{line || ' '}</code></div>)}</div></div></div>;
}

function EconomicsVisual() {
  return <div className="economics-window"><div className="economics-top"><span><Globe2 size={15} /> Global economic calendar</span><small>OCT 28, 2026</small></div>{[['09:00', 'Consumer confidence', 'EUR', '3 stars'], ['12:30', 'GDP growth rate', 'USD', '2 stars'], ['14:00', 'Central bank decision', 'GBP', '3 stars'], ['16:30', 'Crude oil inventories', 'USD', '1 star']].map(([time, title, region, impact], index) => <div className="econ-row" key={title}><time>{time}</time><span className={`econ-dot dot-${index}`} /><b>{title}</b><small>{region}</small><em>{impact}</em></div>)}<p className="illustrative-label">Illustrative calendar layout</p></div>;
}

function YieldCurveVisual() {
  return <div className="yield-window"><div className="yield-head"><span>Government bond yields</span><small>2Y — 30Y</small></div><svg viewBox="0 0 450 220" role="img" aria-label="Illustrative yield curve comparison"><line x1="35" y1="185" x2="430" y2="185" /><line x1="35" y1="22" x2="35" y2="185" /><path d="M36 160 C90 147 110 127 150 115 S215 88 250 77 S340 54 430 43" /><path className="yield-alt" d="M36 174 C90 164 117 143 155 136 S215 116 255 99 S350 84 430 69" /><path className="yield-third" d="M36 142 C90 137 116 118 155 104 S220 91 255 88 S345 75 430 78" />{['2Y', '5Y', '10Y', '20Y', '30Y'].map((label, index) => <text key={label} x={38 + index * 92} y="207">{label}</text>)}</svg><div className="yield-legend"><span>United States</span><span>United Kingdom</span><span>Germany</span></div><p className="illustrative-label">Illustrative yield curves</p></div>;
}

function OptionsVisual() {
  return <div className="options-window"><div className="options-head"><span>Options chain · AAPL</span><span>Expiration&nbsp; Nov 20, 2026⌄</span></div><div className="options-table"><div className="options-row labels"><span>Calls</span><span>Strike</span><span>Puts</span></div>{[['18.20', '215', '1.88'], ['14.40', '220', '3.12'], ['10.75', '225', '5.80'], ['7.30', '230', '9.25'], ['4.65', '235', '13.50']].map(([call, strike, put], index) => <div className={`options-row ${index === 2 ? 'selected' : ''}`} key={strike}><span>{call}</span><b>{strike}</b><span>{put}</span></div>)}</div><div className="options-chart"><span>Strategy payoff</span><svg viewBox="0 0 300 75"><line x1="0" y1="38" x2="300" y2="38" /><path d="M5 62 L85 62 L146 18 L220 18 L294 53" /></svg></div><p className="illustrative-label">Illustrative options chain · sample values</p></div>;
}

function SocialVisual() {
  return <div className="social-board"><article className="social-card"><div className="social-user"><span>AM</span><b>Alex Morgan <small>· 2h</small></b><span>•••</span></div><p>Watching this range closely. A clean break above resistance could shift the short-term structure.</p><div className="social-mini-chart"><svg viewBox="0 0 340 105"><polyline points="0,80 35,76 56,82 80,58 105,64 128,49 155,57 184,32 205,45 231,37 255,52 278,22 306,31 340,12" /></svg></div><div className="social-reactions"><span>♡ 128</span><span>◉ 24 comments</span><span>↗ Share</span></div></article><div className="social-follow-card"><span className="social-avatar violet">S</span><div><b>Market perspective</b><small>Ideas from traders around the world</small></div><ArrowRight size={15} /></div><div className="social-follow-card"><span className="social-avatar blue">TV</span><div><b>Community scripts</b><small>Learn from shared analysis</small></div><ArrowRight size={15} /></div></div>;
}

function NewsVisual() {
  return <div className="news-window"><div className="news-head"><b>Market news</b><span>Latest <ChevronDown size={13} /></span></div>{[['Markets open higher as investors weigh earnings', 'MARKETS', '12 min ago'], ['Technology shares lead the session', 'STOCKS', '34 min ago'], ['Crypto markets edge up in early trading', 'CRYPTO', '1 hr ago']].map(([title, type, ago], index) => <article className="news-story" key={title}><div className={`news-thumb thumb-${index}`}><ChartNoAxesCombined size={20} /></div><div><small>{type} · {ago}</small><b>{title}</b><span>Company earnings and economic data shape market sentiment today.</span></div></article>)}<p className="illustrative-label">Illustrative headlines</p></div>;
}

function ProductsFooter() {
  return <footer className="features-footer"><div className="features-footer-glow" /><div className="features-footer-top"><div className="features-footer-brand"><Link to="/" className="brand"><svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14c2.5-4 4.5 4 7 0 2.5-4 4.5 4 7 0" /><line x1="17" y1="21" x2="22" y2="7" /></svg><b>TradingView</b></Link><p>Look first. Then leap.</p></div><div className="features-footer-columns"><div><b>Products</b><Link to="/chart/BTCUSDT">Supercharts</Link><Link to="/markets/crypto">Screeners & markets</Link><Link to="/paper-trading">Paper trading</Link><Link to="/features">All features</Link></div><div><b>Markets</b><Link to="/markets/crypto">Crypto</Link><Link to="/markets/forex">Forex</Link><Link to="/markets/india">Indian stocks</Link><Link to="/chart/BTCUSDT">Market charts</Link></div><div><b>Community</b><Link to="/#community-ideas">Trading ideas</Link><Link to="/#community">Market news</Link><Link to="/signup">Join the community</Link></div><div><b>Company</b><Link to="/pricing">Plans & pricing</Link><Link to="/signin">Sign in</Link><Link to="/signup">Create account</Link></div></div></div><div className="features-footer-bottom"><span>© 2026 TradingView Clone. Independent project, not affiliated with TradingView.</span><span>Market data and visuals are provided for research and demonstration.</span></div></footer>;
}

export default function Features() {
  const [active, setActive] = useState('charts');
  useEffect(() => {
    document.title = 'Explore all features — TradingView Clone';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sections = categories.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.feature-reveal').forEach((element) => element.classList.add('in-view'));
      return undefined;
    }
    const navObserver = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-20% 0px -65% 0px', threshold: [0, .15, .35, .6] });
    sections.forEach((section) => navObserver.observe(section));
    const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in-view'); revealObserver.unobserve(entry.target); }
    }), { threshold: .12 });
    if (!reduced) document.querySelectorAll('.feature-reveal').forEach((element) => revealObserver.observe(element));
    else document.querySelectorAll('.feature-reveal').forEach((element) => element.classList.add('in-view'));
    return () => { navObserver.disconnect(); revealObserver.disconnect(); };
  }, []);

  return <main className="features-page">
    <header className="features-page-intro"><p>Explore the platform</p><h1>Supercharged<br /><span>Supercharts</span></h1><div className="features-intro-visual"><SuperchartPreview /><div className="intro-glow" /></div><a className="intro-scroll" href="#charts" onClick={(event) => { event.preventDefault(); document.getElementById('charts')?.scrollIntoView({ behavior: 'smooth' }); }}>Explore all features <ChevronDown size={15} /></a></header>
    <CategoryNav active={active} onSelect={setActive} />
    <div className="features-content">
      <section className="features-love feature-reveal"><div><p className="feature-eyebrow">A world of ideas</p><h2>Love in every<br /><span>#TradingView</span></h2><p>Millions of traders, investors and market minds learning from one another.</p></div><div className="love-tiles"><div className="love-tile tile-large"><ChartWindow title="NASDAQ · AAPL" compact /><span>See every angle</span></div><div className="love-tile tile-purple"><Sparkles size={20} /><b>Ideas that move<br />with the markets.</b><small>Made by traders, for traders</small></div><div className="love-tile tile-blue"><Users size={20} /><b>A global community<br />at your fingertips.</b><small>Explore perspectives</small></div></div></section>

      <FeatureSection id="charts" eyebrow="Supercharged Supercharts" title={<>Charts that<br />move markets</>} description="Whether you want the latest price or a deeper look at market patterns, find the tools to explore each move." visual={<SuperchartPreview />} className="feature-reveal"><FeatureButton to="/chart/BTCUSDT">Open Supercharts</FeatureButton></FeatureSection>
      <section className="features-grid reveal feature-reveal"><article><Layers3 /><h3>Up to 16 charts per screen</h3><p>Compare symbols and timeframes in one synchronized workspace.</p></article><article><Search /><h3>Command search</h3><p>Find symbols, features and actions from one place.</p></article><article><ChartNoAxesCombined /><h3>Technical analysis</h3><p>Explore indicators, drawing tools and chart types.</p></article><article><CandlestickChart /><h3>Custom intervals</h3><p>Shape your view around the market and your workflow.</p></article></section>
      <section className="feature-multi-showcase feature-reveal"><div className="multi-showcase-copy"><p className="feature-eyebrow">One screen, many perspectives</p><h2>See the bigger<br />market picture.</h2><p>Arrange chart layouts, watchlists and the tools you need around your analysis.</p><FeatureButton to="/chart/BTCUSDT" secondary>Explore charts</FeatureButton></div><SuperchartPreview multi /></section>

      <FeatureSection id="alerts" eyebrow="Stay in the loop" title="Unmissable alerts" description="Keep an eye on price levels and market moves with alerts attached to symbols and conditions." visual={<div className="alert-visual"><div className="alert-visual-top"><Bell /><b>Price alerts</b><span>•••</span></div><div className="alert-status-card"><span className="alert-signal">BTC</span><div><b>BTCUSDT crossed above</b><small>Price alert · 2 minutes ago</small></div><strong>$80,922</strong></div><div className="alert-status-card"><span className="alert-signal purple">ETH</span><div><b>ETHUSDT fell below</b><small>Price alert · 18 minutes ago</small></div><strong>$2,356</strong></div><div className="alert-config"><span>Alert conditions</span><div><b>Price</b><span>Crossing</span><b>Target</b></div><button type="button"><Bell size={13} /> Create alert</button></div><p className="illustrative-label">Illustrative alert panel</p></div>} reverse className="feature-reveal"><FeatureButton to="/chart/BTCUSDT">Set a price alert</FeatureButton></FeatureSection>

      <FeatureSection id="financials" eyebrow="Go beyond the price" title="Fundamental values, and much more" description="Explore company metrics and financial statements alongside market charts. Compare revenue, earnings and valuation history." visual={<div className="financial-visual"><div className="financial-head"><span><b>AAPL</b> · Financials</span><small>Annual · USD</small></div><div className="financial-tabs"><span>Overview</span><b>Income statement</b><span>Balance sheet</span><span>Cash flow</span></div><div className="financial-chart"><div className="financial-bars">{[40,53,48,62,58,72,68,84,77,91,86,100].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="financial-labels"><span>Revenue</span><span>Operating income</span><span>Net income</span></div></div><div className="financial-stats"><div><small>Revenue</small><b>$391.0B</b><span className="feature-positive">+2.0%</span></div><div><small>EPS diluted</small><b>$6.08</b><span className="feature-positive">+10.2%</span></div><div><small>P/E ratio</small><b>37.4</b><span>TTM</span></div></div><p className="illustrative-label">Illustrative financial display · sample values</p></div>} className="feature-reveal"><FeatureButton to="/markets/india">Explore markets</FeatureButton></FeatureSection>

      <FeatureSection id="pine-script" eyebrow="Code your own edge" title="Simple Pine Script for complex tools" description="Build indicators and strategies in a chart-connected editor. Learn from examples, customize a script and visualize the result." visual={<PineEditorVisual />} reverse className="feature-reveal"><FeatureButton to="/chart/BTCUSDT" secondary>Open the chart workspace</FeatureButton></FeatureSection>

      <FeatureSection id="trading" eyebrow="Your workflow, your way" title="Made to trade" description="Keep charts, order tickets and account context together. Practice with a simulated account in this clone." visual={<div className="trade-visual"><div className="trade-chart"><ChartWindow title="BTCUSDT · Binance" compact /></div><div className="trade-ticket"><div className="trade-ticket-head"><b>Paper Trading</b><span>SIMULATED</span></div><div className="trade-buy-sell"><button type="button">Buy</button><button type="button">Sell</button></div><label>Order type <b>Market⌄</b></label><label>Amount <b>250 USDT</b></label><div className="trade-total"><span>Estimated quantity</span><b>0.00308 BTC</b></div><button className="trade-submit" type="button">Place paper order</button></div><p className="illustrative-label">Illustrative order ticket · simulated trading</p></div>} className="feature-reveal"><FeatureButton to="/paper-trading">Explore paper trading</FeatureButton></FeatureSection>

      <FeatureSection id="screeners" eyebrow="Find your next idea" title="Screens everything" description="Compare assets by market data and filter your search. Explore live crypto markets and supported instruments in this project." visual={<ScreenerVisual />} reverse className="feature-reveal"><FeatureButton to="/markets/crypto" secondary>Explore crypto markets</FeatureButton></FeatureSection>

      <FeatureSection id="macroeconomics" eyebrow="See the global picture" title="Into the macro maze" description="Follow economic events and regional indicators to put market moves in context." visual={<EconomicsVisual />} className="feature-reveal"><FeatureButton to="/markets/india">Explore market data</FeatureButton></FeatureSection>

      <FeatureSection id="yield-curves" eyebrow="Across the curve" title="Masters of the yield curve" description="Compare how government borrowing costs vary across maturities and regions. This chart is an illustrative preview." visual={<YieldCurveVisual />} reverse className="feature-reveal" />

      <FeatureSection id="options" eyebrow="Plan the possibilities" title="All the options are on the table" description="Explore an options-chain inspired view and a strategy payoff preview. Options quotes and trading are not connected in this clone." visual={<OptionsVisual />} className="feature-reveal" />

      <section id="markets" className="feature-markets feature-reveal"><div className="feature-markets-copy"><p className="feature-eyebrow">Follow what moves you</p><h2>Global markets<br />in your hand</h2><p>Explore crypto, forex and Indian market pages with data connected to this project’s existing services.</p><div className="market-feature-links"><Link to="/markets/crypto"><span>₿</span><b>Crypto</b><ArrowRight size={14} /></Link><Link to="/markets/forex"><span>FX</span><b>Forex</b><ArrowRight size={14} /></Link><Link to="/markets/india"><span>IN</span><b>Indian markets</b><ArrowRight size={14} /></Link></div></div><div className="markets-globe" aria-hidden="true"><div className="globe-ring ring-one" /><div className="globe-ring ring-two" /><div className="globe-grid" /><div className="globe-track">BTC&nbsp; +1.12%</div><div className="globe-track track-two">EUR/USD&nbsp; +0.27%</div><div className="globe-track track-three">NIFTY&nbsp; +0.64%</div><Globe2 /></div></section>

      <FeatureSection id="community" eyebrow="A global network of traders" title="The social network for your finance life" description="Explore market ideas, share perspectives and learn from a community that follows markets around the world." visual={<SocialVisual />} reverse className="feature-reveal"><FeatureButton to="/#community-ideas" secondary>Explore community ideas</FeatureButton></FeatureSection>

      <FeatureSection id="news" eyebrow="Stay informed" title="Market news, in context" description="Catch up on the headlines shaping financial markets. The clone’s community news section is powered by its configured news service." visual={<NewsVisual />} className="feature-reveal"><FeatureButton to="/#community">Read community news</FeatureButton></FeatureSection>

      <section className="features-final-cta feature-reveal"><ShieldCheck size={20} /><h2>Join traders and investors<br />exploring the markets.</h2><p>Start with a chart, follow an idea, or practice with a paper account.</p><div><FeatureButton to="/signup">Get started</FeatureButton><FeatureButton to="/chart/BTCUSDT" secondary>Open Supercharts</FeatureButton></div></section>
    </div>
    <ProductsFooter />
  </main>;
}
