import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock3, History, RefreshCw, RotateCcw, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../services/api';
import { ErrorState, formatDate, LoadingState, money } from '../components/Shared';
import { canSubmitPaperOrder, clearPaperOrderIdempotencyKey, DEFAULT_PAPER_ORDER, getPaperOrderExecutionQuantity, getPaperOrderIdempotencyKey, getPaperOrderInputMessage, getPaperOrderModeInput, getPaperOrderPreview, isPaperQuoteFresh } from '../utils/paperOrderPreview';
import { submitFullHoldingSell } from '../utils/paperTradingActions';

const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'LTCUSDT'];
const formatQuantity = (value) => Number(value).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
const formatUsdt = (value) => value === null || !Number.isFinite(Number(value)) ? 'Unavailable' : money(value) + ' USDT';
const formatPnl = (value) => value === null || !Number.isFinite(Number(value))
  ? 'Unavailable'
  : (value >= 0 ? '+' : '') + money(value) + ' USDT';

const makePerformancePoints = (portfolio) => {
  const points = [{
    time: portfolio.resetAt || portfolio.createdAt,
    value: portfolio.initialBalance,
    label: 'Starting balance'
  }];
  for (const trade of portfolio.trades || []) {
    points.push({
      time: trade.executedAt,
      value: trade.portfolioValueAfter,
      label: trade.side.toUpperCase() + ' ' + trade.symbol
    });
  }
  if (portfolio.equity !== null) {
    points.push({ time: new Date().toISOString(), value: portfolio.equity, label: 'Current portfolio value' });
  }
  return points;
};

function PerformanceChart({ points }) {
  const valid = (points || [])
    .map((point) => ({ ...point, value: Number(point.value), time: new Date(point.time).getTime() }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.time));
  if (valid.length < 2) {
    return <div className="performance-empty"><Activity size={18} /><span>Portfolio performance will appear after your first market order.</span></div>;
  }
  const min = Math.min(...valid.map((point) => point.value));
  const max = Math.max(...valid.map((point) => point.value));
  const range = max - min || 1;
  const line = valid.map((point, index) => (index / (valid.length - 1)) * 100 + ',' + (92 - ((point.value - min) / range) * 78)).join(' ');
  return <div className="performance-chart-wrap">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="performance-chart" role="img" aria-label="Paper portfolio value over time">
      <defs><linearGradient id="performanceFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#6c91ff" stopOpacity=".28" /><stop offset="100%" stopColor="#6c91ff" stopOpacity="0" /></linearGradient></defs>
      <polygon points={'0,100 ' + line + ' 100,100'} fill="url(#performanceFill)" />
      <polyline points={line} fill="none" stroke="#6c91ff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
    <div className="performance-axis"><span>{formatDate(valid[0].time)}</span><span>{formatDate(valid[valid.length - 1].time)}</span></div>
  </div>;
}

export default function PaperTrading() {
  const [portfolio, setPortfolio] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [side, setSide] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [limitPriceInput, setLimitPriceInput] = useState('');
  const [amountMode, setAmountMode] = useState(DEFAULT_PAPER_ORDER.mode);
  const [entryAmount, setEntryAmount] = useState(DEFAULT_PAPER_ORDER.input);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sellingSymbol, setSellingSymbol] = useState('');
  const [notice, setNotice] = useState('');
  const loadLock = useRef(false);
  const orderLock = useRef(false);
  const pendingOrderRef = useRef(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    if (loadLock.current || orderLock.current) return;
    loadLock.current = true;
    if (!hasLoaded.current) setStatus('loading');
    setError('');
    try {
      const account = await api.paperPortfolio();
      setPortfolio(account.data);
      setPerformance(makePerformancePoints(account.data));
      hasLoaded.current = true;
      setStatus('ready');
    } catch (requestError) {
      setError(requestError.message);
      setStatus(hasLoaded.current ? 'ready' : 'error');
    } finally {
      loadLock.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    setQuote(null);
    setQuoteError('');
    setQuoteLoading(true);

    const refreshQuote = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const rows = await api.ticker([symbol]);
        const row = Array.isArray(rows) ? rows.find((item) => item.symbol === symbol) : null;
        const price = Number(row?.lastPrice);
        if (!Number.isFinite(price) || price <= 0) throw new Error('A live Binance quote is not available for ' + symbol + '.');
        if (active) {
          setQuote({ symbol, price, updatedAt: new Date() });
          setQuoteError('');
        }
      } catch (requestError) {
        if (active) {
          setQuote(null);
          setQuoteError(requestError.message);
        }
      } finally {
        requestInFlight = false;
        if (active) setQuoteLoading(false);
      }
    };

    refreshQuote();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshQuote();
    }, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [symbol]);

  const previewQuote = orderType === 'limit' && Number.isFinite(Number(limitPriceInput)) && Number(limitPriceInput) > 0
    ? { symbol, price: Number(limitPriceInput), updatedAt: quote?.updatedAt }
    : quote;
  const orderEstimate = useMemo(() => getPaperOrderPreview({ mode: amountMode, input: entryAmount, quote: previewQuote, symbol }), [amountMode, entryAmount, previewQuote, symbol]);
  const inputMessage = getPaperOrderInputMessage(amountMode, entryAmount);
  const limitPriceValid = orderType !== 'limit' || (Number.isFinite(Number(limitPriceInput)) && Number(limitPriceInput) > 0 && Number(limitPriceInput) <= 1_000_000_000 && Number(Number(limitPriceInput).toFixed(8)) === Number(limitPriceInput));
  const selectedHolding = portfolio?.holdings?.find((holding) => holding.symbol === symbol);
  const estimatedSellQuantity = getPaperOrderExecutionQuantity({ mode: amountMode, input: entryAmount, quote: previewQuote, symbol });
  const orderHasHoldings = side === 'sell' && selectedHolding && estimatedSellQuantity !== null && (selectedHolding.availableQuantity ?? selectedHolding.quantity) + 1e-12 >= estimatedSellQuantity;
  const canPlaceOrder = limitPriceValid && canSubmitPaperOrder({
    mode: amountMode,
    input: entryAmount,
    quote: previewQuote,
    symbol,
    side,
    availableCash: portfolio?.availableCash ?? portfolio?.cash,
    holdingQuantity: selectedHolding?.availableQuantity ?? selectedHolding?.quantity,
    busy
  });

  function changeAmountMode(nextMode) {
    setEntryAmount(getPaperOrderModeInput({ mode: amountMode, nextMode, input: entryAmount, quote: previewQuote, symbol }));
    setAmountMode(nextMode);
  }

  async function placeOrder(event) {
    event.preventDefault();
    if (orderLock.current || !canPlaceOrder) return;
    orderLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const amount = Number(entryAmount);
      const order = { symbol, side, orderType };
      if (amountMode === 'quote') order.amountUsdt = amount;
      else order.quantity = amount;
      if (orderType === 'limit') order.limitPrice = Number(limitPriceInput);
      const response = await api.paperOrder(order, getPaperOrderIdempotencyKey(order, pendingOrderRef));
      clearPaperOrderIdempotencyKey(order, pendingOrderRef);
      setPortfolio(response.data);
      setPerformance(makePerformancePoints(response.data));
      setEntryAmount('');
      if (response.trade) {
        setNotice(response.trade.side.toUpperCase() + ' ' + formatQuantity(response.trade.quantity) + ' ' + response.trade.symbol + ' at ' + money(response.trade.executionPrice, 4) + ' USDT. Simulated order.');
      } else if (response.order?.status === 'pending') {
        setNotice('Limit ' + response.order.side.toUpperCase() + ' ' + formatQuantity(response.order.quantity) + ' ' + response.order.symbol + ' is pending at ' + money(response.order.limitPrice, 4) + ' USDT.');
      } else if (response.duplicate) setNotice('This order was already processed. Your paper portfolio is up to date.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      orderLock.current = false;
      setBusy(false);
    }
  }

  async function sellHolding(holding) {
    if (orderLock.current || busy) return;
    setError('');
    setNotice('');
    await submitFullHoldingSell({
      holding,
      lockRef: orderLock,
      pendingOrderRef,
      submitOrder: api.paperOrder,
      refreshPortfolio: api.paperPortfolio,
      onStart: (order) => { setSellingSymbol(order.symbol); setBusy(true); },
      onPortfolio: (data) => {
        setPortfolio(data);
        setPerformance(makePerformancePoints(data));
        hasLoaded.current = true;
        setStatus('ready');
      },
      onSuccess: (response) => {
        const trade = response?.trade;
        if (trade) {
          setNotice('SELL ' + formatQuantity(trade.quantity) + ' ' + trade.symbol + ' at ' + money(trade.executionPrice, 4) + ' USDT. Simulated order.');
        } else {
          setNotice('The sell order for ' + holding.symbol + ' was already processed. Your paper portfolio is up to date.');
        }
      },
      onFailure: (requestError) => setError(requestError.message),
      onRefreshFailure: () => setError('The sale succeeded, but the portfolio could not be refreshed. Use Refresh to load the latest balances; the order was not submitted again.'),
      onFinish: () => { setSellingSymbol(''); setBusy(false); }
    });
  }

  async function reset() {
    if (orderLock.current) return;
    if (!window.confirm('Reset your paper portfolio to ' + formatUsdt(portfolio?.initialBalance ?? 100_000) + '? This clears current holdings, orders and trade history.')) return;
    orderLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.resetPaperPortfolio();
      setPortfolio(response.data);
      setPerformance(makePerformancePoints(response.data));
      setNotice('Paper portfolio reset to 100,000 USDT.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      orderLock.current = false;
      setBusy(false);
    }
  }

  async function cancelOrder(order) {
    if (orderLock.current || order?.status !== 'pending') return;
    orderLock.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await api.cancelPaperOrder(order.orderId);
      setPortfolio(response.data);
      setPerformance(makePerformancePoints(response.data));
      setNotice('Pending limit order cancelled.');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      orderLock.current = false;
      setBusy(false);
    }
  }

  const holdingsValue = portfolio?.holdings?.reduce((sum, item) => sum + (Number(item.marketValue) || 0), 0) ?? 0;
  const returnPercent = portfolio?.totalReturnPercent;
  const amountStep = amountMode === 'quote' ? '0.01' : '0.00000001';
  const estimatedQuantity = orderEstimate ? formatQuantity(orderEstimate.quantity) : '—';

  return <main className="page-wrap page-content paper-page">
    <div className="paper-heading">
      <div><span className="eyebrow">Practice workspace</span><h1>Paper trading</h1><p>Simulated crypto spot account in USDT. Starting balance: {formatUsdt(portfolio?.initialBalance ?? 100_000)}. Market orders use current server-side Binance prices; no real funds are traded.</p></div>
      <button className="button button-secondary" onClick={load} disabled={status === 'loading' || busy}><RefreshCw size={14} className={status === 'loading' ? 'spin' : ''} /> Refresh</button>
    </div>
    {error && portfolio && <div className="paper-error"><ErrorState message={error} onRetry={load} /></div>}
    {notice && <div className="paper-notice"><CheckCircle2 size={16} />{notice}</div>}
    {status === 'loading' && !portfolio ? <LoadingState label="Loading your paper portfolio…" /> : null}
    {status === 'error' && !portfolio ? <ErrorState message={error || 'Paper trading is temporarily unavailable.'} onRetry={load} /> : null}

    {portfolio && <>
      <section className="paper-stat-grid">
        <article className="paper-stat"><span><Wallet size={14} /> Initial balance</span><strong>{formatUsdt(portfolio.initialBalance)}</strong><small>Set once for this account</small></article>
        <article className="paper-stat"><span><Wallet size={14} /> Available cash</span><strong>{formatUsdt(portfolio.availableCash ?? portfolio.cash)}</strong><small>{formatUsdt(portfolio.reservedCash || 0)} reserved by pending buy limits</small></article>
        <article className="paper-stat"><span><TrendingUp size={14} /> Portfolio value</span><strong>{formatUsdt(portfolio.equity)}</strong><small>Cash plus live holdings value</small></article>
        <article className="paper-stat"><span><Activity size={14} /> Unrealized P/L</span><strong className={portfolio.unrealizedPnl === null ? '' : portfolio.unrealizedPnl >= 0 ? 'positive' : 'negative'}>{formatPnl(portfolio.unrealizedPnl)}</strong><small>Open position gains or losses</small></article>
        <article className="paper-stat"><span><Activity size={14} /> Realized P/L</span><strong className={(portfolio.realizedPnl || 0) >= 0 ? 'positive' : 'negative'}>{formatPnl(portfolio.realizedPnl)}</strong><small>Closed trade results</small></article>
        <article className="paper-stat"><span><TrendingUp size={14} /> Total return</span><strong className={returnPercent === null ? '' : returnPercent >= 0 ? 'positive' : 'negative'}>{returnPercent === null || !Number.isFinite(Number(returnPercent)) ? 'Unavailable' : (returnPercent >= 0 ? '+' : '') + Number(returnPercent).toFixed(2) + '%'}</strong><small>Against initial balance</small></article>
      </section>

      <div className="paper-main-grid">
        <section className="paper-panel performance-panel">
          <header><div><h2>Portfolio performance</h2><p>Initial balance, recorded executions, and current value.</p></div><span className="panel-live-tag"><span /> Live valuation</span></header>
          <PerformanceChart points={performance} />
        </section>

        <section className="paper-panel order-panel">
          <header><div><h2>New order</h2><p>Market orders execute at the server quote. Limit orders wait for the price condition.</p></div><span className="paper-only-tag">PAPER ONLY</span></header>
          <form onSubmit={placeOrder}>
            <div className="order-side-select">
              <button type="button" className={side === 'buy' ? 'buy-active' : ''} onClick={() => setSide('buy')}><ArrowUpRight size={15} /> Buy</button>
              <button type="button" className={side === 'sell' ? 'sell-active' : ''} onClick={() => setSide('sell')}><ArrowDownRight size={15} /> Sell</button>
            </div>
            <label>Trading pair<select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{symbols.map((pair) => <option value={pair} key={pair}>{pair.replace('USDT', '')} / USDT</option>)}</select></label>
            <label>Order type<select value={orderType} onChange={(event) => { setOrderType(event.target.value); setLimitPriceInput(''); }}>{['market', 'limit'].map((type) => <option value={type} key={type}>{type === 'market' ? 'Market' : 'Limit'}</option>)}</select></label>
            {orderType === 'limit' && <label>Limit price (USDT)<input type="number" required min="0.00000001" max="1000000000" step="0.00000001" value={limitPriceInput} onChange={(event) => setLimitPriceInput(event.target.value)} placeholder="Price per unit" /></label>}
            <div className="order-amount-mode" role="group" aria-label="Order amount type">
              <button type="button" className={amountMode === 'quote' ? 'active' : ''} onClick={() => changeAmountMode('quote')}>Amount (USDT)</button>
              <button type="button" className={amountMode === 'quantity' ? 'active' : ''} onClick={() => changeAmountMode('quantity')}>Quantity</button>
            </div>
            <label>{amountMode === 'quote' ? 'Order amount (USDT)' : 'Quantity (' + symbol.replace('USDT', '') + ')'}
              <input type="number" min={amountMode === 'quote' ? '0.01' : '0.00000001'} max={amountMode === 'quote' ? '1000000000' : '1000000'} step={amountStep} value={entryAmount} onChange={(event) => setEntryAmount(event.target.value)} placeholder={amountMode === 'quote' ? '100.00' : '0.001'} required />
            </label>
            <div className="order-live-quote">
              <span>{orderType === 'limit' ? 'Current Binance price' : 'Current Binance price'}</span>
              <strong>{quote?.symbol === symbol && isPaperQuoteFresh(quote) ? money(quote.price, 4) + ' USDT' : quoteLoading ? 'Loading quote…' : 'Unavailable'}</strong>
              {quote?.symbol === symbol && <small>{isPaperQuoteFresh(quote) ? 'Updated ' + quote.updatedAt.toLocaleTimeString() : 'Quote is stale; waiting for refresh'}</small>}
            </div>
            {quoteError && <p className="order-quote-error" role="alert">{quoteError}</p>}
            <div className="order-estimate"><span>Estimated order value</span><b>{orderEstimate ? formatUsdt(orderEstimate.value) : quoteLoading ? 'Loading live quote…' : quoteError ? 'Quote unavailable' : quote?.symbol === symbol && !isPaperQuoteFresh(quote) ? 'Quote is stale; refreshing…' : inputMessage || 'Waiting for a live quote'}</b></div>
            <div className="order-estimate"><span>Estimated quantity</span><b>{orderEstimate ? estimatedQuantity + ' ' + symbol.replace('USDT', '') : '—'}</b></div>
            {side === 'buy' && orderEstimate && portfolio && orderEstimate.value > portfolio.cash && <p className="order-quote-error" role="status">Order value exceeds your available {formatUsdt(portfolio.cash)}.</p>}
            {side === 'sell' && orderEstimate && portfolio && !orderHasHoldings && <p className="order-quote-error" role="status">You do not hold enough {symbol.replace('USDT', '')} for this order.</p>}
            <button className={'button ' + (side === 'buy' ? 'button-buy' : 'button-sell') + ' order-submit'} disabled={!canPlaceOrder}>{busy ? 'Submitting order…' : 'Place paper ' + (orderType === 'limit' ? 'limit ' : '') + side + ' order'}</button>
            <small>{orderType === 'limit' ? 'Buy limits are eligible at or below the limit; sell limits at or above. Fills are checked on account refresh using Binance last price and conservatively recorded at the limit.' : 'Estimates can change before execution. The backend checks the current Binance price, available cash, and holdings.'}</small>
          </form>
        </section>
      </div>

      <section className="paper-panel holdings-panel">
        <header><div><h2>Open positions</h2><p>Market value and unrealized P/L use Binance last prices. Valuation: {portfolio.marketDataStatus || 'unknown'}{portfolio.pricesAsOf ? ' as of ' + formatDate(portfolio.pricesAsOf) : ''}.</p></div><span className="holdings-total">{portfolio.equity === null ? 'Live value unavailable' : formatUsdt(holdingsValue)}</span></header>
        {!portfolio.holdings.length ? <div className="table-empty"><Wallet size={20} /><span>No open positions yet. Place a paper buy order to begin.</span></div> : <div className="responsive-table">
          <table className="data-table"><thead><tr><th>Asset</th><th>Direction</th><th>Quantity</th><th>Average entry</th><th>Last price</th><th>Market value</th><th>Unrealized P/L</th><th>Realized P/L</th><th>Action</th></tr></thead>
            <tbody>{portfolio.holdings.map((item) => <tr key={item.symbol}><td><b>{item.symbol}</b><small>Crypto spot</small></td><td>{item.direction || 'Long'}</td><td>{formatQuantity(item.quantity)}</td><td>{money(item.averageEntryPrice, 4)} USDT</td><td>{item.lastPrice === null ? 'Unavailable' : money(item.lastPrice, 4) + ' USDT'}</td><td>{formatUsdt(item.marketValue)}</td><td className={(item.unrealizedPnl || 0) >= 0 ? 'positive' : 'negative'}>{formatPnl(item.unrealizedPnl)}{item.unrealizedPnlPercent === null ? '' : ' (' + Number(item.unrealizedPnlPercent).toFixed(2) + '%)'}</td><td className={(item.realizedPnl || 0) >= 0 ? 'positive' : 'negative'}>{formatPnl(item.realizedPnl)}</td><td>{Number(item.availableQuantity ?? item.quantity) > 0 ? <button type="button" className="button button-sell holding-sell-button" aria-label={'Sell all ' + item.symbol} title="Sell all quantity not reserved by pending orders" disabled={busy} onClick={() => sellHolding(item)}>{sellingSymbol === item.symbol ? 'Selling…' : 'Sell all available'}</button> : 'Reserved by pending order'}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>

      <section className="paper-panel history-panel">
        <header><div><h2>Orders</h2><p>Limit orders reserve cash or position quantity until filled or cancelled.</p></div><span className="holdings-total">Available cash {formatUsdt(portfolio.availableCash ?? portfolio.cash)}</span></header>
        {!portfolio.orders?.length ? <div className="table-empty"><Clock3 size={19} /><span>No pending or completed limit orders.</span></div> : <div className="responsive-table">
          <table className="data-table"><thead><tr><th>Submitted</th><th>Pair</th><th>Side / type</th><th>Quantity</th><th>Limit price</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{[...portfolio.orders].reverse().map((order) => <tr key={order.orderId}><td>{formatDate(order.createdAt)}</td><td><b>{order.symbol}</b></td><td>{order.side.toUpperCase()} / LIMIT</td><td>{formatQuantity(order.quantity)}</td><td>{money(order.limitPrice, 4)} USDT</td><td>{order.status}</td><td>{order.status === 'pending' ? <button type="button" className="button button-secondary" disabled={busy} onClick={() => cancelOrder(order)}>Cancel</button> : order.executionPrice ? 'Fill ' + money(order.executionPrice, 4) : '—'}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>

      <section className="paper-panel history-panel">
        <header><div><h2><History size={17} /> Trade history</h2><p>Market executions stored with your account.</p></div><button className="reset-button" onClick={reset} disabled={busy}><RotateCcw size={14} /> Reset portfolio</button></header>
        {!portfolio.trades.length ? <div className="table-empty"><Clock3 size={19} /><span>No paper orders have been placed yet.</span></div> : <div className="responsive-table">
          <table className="data-table"><thead><tr><th>Pair / order ID</th><th>Side / type</th><th>Quantity</th><th>Entry time</th><th>Entry price</th><th>Exit / fill time</th><th>Execution price</th><th>Trade value</th><th>Realized P/L</th></tr></thead>
            <tbody>{[...portfolio.trades].reverse().map((trade) => <tr key={trade.orderId}><td><b>{trade.symbol}</b><small title={trade.orderId}>ID {trade.orderId.slice(0, 8)}</small></td><td><span className={'history-side ' + trade.side}>{trade.side.toUpperCase()}</span> / {trade.orderType || 'market'}</td><td>{formatQuantity(trade.quantity)}</td><td>{formatDate(trade.entryAt || trade.executedAt)}</td><td>{money(trade.entryPrice ?? trade.executionPrice, 4)} USDT</td><td>{formatDate(trade.executedAt)}</td><td>{money(trade.executionPrice, 4)} USDT</td><td>{formatUsdt(trade.notional)}</td><td className={(trade.realizedPnl || 0) >= 0 ? 'positive' : 'negative'}>{formatPnl(trade.realizedPnl)}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>
    </>}
  </main>;
}
