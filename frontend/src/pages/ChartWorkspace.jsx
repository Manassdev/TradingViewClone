import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BellPlus, CandlestickChart, ChevronDown,
  Circle, CircleHelp, ExternalLink, History, Info, LineChart, Minus, MousePointer2,
  Pencil, Plus, Percent, RefreshCw, Search, SlidersHorizontal, Square, Star, Trash2, TrendingUp,
  Type, UserRound, Wallet, X
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ErrorState, LoadingState, money } from '../components/Shared';
import {
  canSubmitPaperOrder, DEFAULT_PAPER_ORDER, getPaperOrderExecutionQuantity,
  clearPaperOrderIdempotencyKey, getPaperOrderIdempotencyKey, getPaperOrderInputMessage,
  getPaperOrderModeInput, getPaperOrderPreview, isPaperQuoteFresh
} from '../utils/paperOrderPreview';
import { getChartIndicators, mapBinanceCandles } from '../utils/chartData';

const timeframes = [
  { label: '1m', value: '1m' }, { label: '5m', value: '5m' }, { label: '15m', value: '15m' },
  { label: '30m', value: '30m' }, { label: '1h', value: '1h' }, { label: '4h', value: '4h' },
  { label: '1D', value: '1d' }, { label: '1W', value: '1w' }, { label: '1M', value: '1M' }
];
const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT', 'LTCUSDT'];
const tabs = [
  { id: 'watchlist', label: 'Watchlist', icon: Star }, { id: 'trade', label: 'Trade', icon: TrendingUp },
  { id: 'portfolio', label: 'Portfolio', icon: Wallet }, { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'details', label: 'Details', icon: Info }, { id: 'profile', label: 'Profile', icon: UserRound }
];
const tools = [
  { id: 'cursor', label: 'Cursor', icon: MousePointer2 }, { id: 'trend', label: 'Trend line', icon: TrendingUp },
  { id: 'horizontal', label: 'Horizontal line', icon: Minus }, { id: 'vertical', label: 'Vertical line', icon: Activity },
  { id: 'ray', label: 'Ray', icon: ArrowUpRight }, { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'circle', label: 'Circle', icon: Circle }, { id: 'arrow', label: 'Arrow', icon: ArrowDownRight },
  { id: 'fibonacci', label: 'Fibonacci retracement', icon: Percent },
  { id: 'brush', label: 'Brush', icon: Pencil }, { id: 'text', label: 'Text annotation', icon: Type }
];
const indicatorChoices = [
  { id: 'sma20', label: 'SMA (20)', color: '#f6c85f' }, { id: 'sma50', label: 'SMA (50)', color: '#55b7ff' },
  { id: 'ema20', label: 'EMA (20)', color: '#c08cff' }, { id: 'volume', label: 'Volume', color: '#34c7a1' }
];

const formatChartTime = (time) => {
  const date = new Date(Number(time) * 1000);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const newDrawingId = () => globalThis.crypto?.randomUUID?.() || `drawing-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function MarketStrip() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let inFlight = false;
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api.ticker(symbols);
        if (!Array.isArray(data)) throw new Error('Market prices are unavailable.');
        if (active) { setRows(data); setError(''); }
      } catch (requestError) {
        if (active) setError(requestError.message);
      } finally { inFlight = false; }
    };
    load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return <div className="tv-market-strip" aria-label="Live cryptocurrency market summary">
    <div className="tv-strip-heading"><span><Activity size={13} /> Market overview</span><small>{error || 'BINANCE SPOT · LIVE'}</small></div>
    {['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'].map((symbol) => {
      const row = rows.find((item) => item.symbol === symbol);
      const change = Number(row?.priceChangePercent);
      return <Link to={`/chart/${symbol}`} className="tv-strip-quote" key={symbol}>
        <b>{symbol.replace('USDT', '')} <small>/ USDT</small></b><span>{row ? money(row.lastPrice, 2) : '—'}</span>
        <small className={`tv-strip-change ${Number.isFinite(change) ? change >= 0 ? 'positive' : 'negative' : ''}`}>{Number.isFinite(change) ? `${change >= 0 ? '+' : ''}${money(change)}%` : '—'}</small>
      </Link>;
    })}
  </div>;
}

function projectPoint(point, chart, candleSeries) {
  if (!point || !chart || !candleSeries) return null;
  const x = chart.timeScale().timeToCoordinate(point.time);
  const y = candleSeries.priceToCoordinate(point.price);
  return x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y };
}

function DrawingShape({ drawing, chart, candleSeries, selected, selectable }) {
  const points = (drawing.points || []).map((point) => projectPoint(point, chart, candleSeries));
  if (!points.length || points.some((point) => point === null)) return null;
  const singleAnchorTypes = ['horizontal', 'vertical', 'text'];
  // A two-point draft starts with only its first anchor. Do not dereference a
  // missing second point while React renders between pointerdown and pointermove.
  if (points.length < 2 && !singleAnchorTypes.includes(drawing.type)) return null;
  const [a, b] = points;
  const color = selected ? '#ffd166' : '#9eb5ff';
  const common = {
    stroke: color, strokeWidth: selected ? 2.4 : 1.6, vectorEffect: 'non-scaling-stroke',
    onPointerDown: selectable ? (event) => { event.preventDefault(); event.stopPropagation(); drawing.onSelect(drawing.id); } : undefined,
    pointerEvents: selectable ? 'stroke' : 'none', className: 'tv-drawing-shape'
  };
  if (drawing.type === 'horizontal') return <line {...common} x1="0" x2="100%" y1={a.y} y2={a.y} />;
  if (drawing.type === 'vertical') return <line {...common} x1={a.x} x2={a.x} y1="0" y2="100%" />;
  if (drawing.type === 'trend' || drawing.type === 'ray' || drawing.type === 'arrow') {
    let x2 = b.x, y2 = b.y;
    if (drawing.type === 'ray') {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) > 0.001) {
        const edge = dx > 0 ? 10_000 : -10_000;
        const factor = (edge - a.x) / dx;
        x2 = a.x + dx * factor; y2 = a.y + dy * factor;
      }
    }
    return <line {...common} x1={a.x} y1={a.y} x2={x2} y2={y2} markerEnd={drawing.type === 'arrow' ? 'url(#tv-arrowhead)' : undefined} />;
  }
  if (drawing.type === 'rectangle') return <rect {...common} x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)} width={Math.max(1, Math.abs(b.x - a.x))} height={Math.max(1, Math.abs(b.y - a.y))} fill="rgba(127,157,255,.04)" />;
  if (drawing.type === 'circle') return <ellipse {...common} cx={a.x} cy={a.y} rx={Math.max(1, Math.abs(b.x - a.x))} ry={Math.max(1, Math.abs(b.y - a.y))} fill="rgba(127,157,255,.035)" />;
  if (drawing.type === 'fibonacci') {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const high = Math.max(drawing.points[0].price, drawing.points[1].price);
    const low = Math.min(drawing.points[0].price, drawing.points[1].price);
    const range = high - low;
    const levels = [0, .236, .382, .5, .618, .786, 1];
    const projectedLevels = levels.map((level) => ({
      level,
      y: candleSeries.priceToCoordinate(high - range * level)
    }));
    if (projectedLevels.some(({ y }) => !Number.isFinite(y))) return null;
    return <g>{projectedLevels.map(({ level, y }) => {
      return <g key={level}><line {...common} x1={x1} x2={x2} y1={y} y2={y} /><text x={x2 + 4} y={y + 3} fill={color} stroke="none" fontSize="9" pointerEvents="none">{`${(level * 100).toFixed(level === 0 || level === 1 ? 0 : 1)}%`}</text></g>;
    })}</g>;
  }
  if (drawing.type === 'brush') return <polyline {...common} points={points.map((point) => `${point.x},${point.y}`).join(' ')} strokeLinecap="round" strokeLinejoin="round" />;
  if (drawing.type === 'text') return <text {...common} x={a.x} y={a.y} fill={color} stroke="none" fontSize="13" pointerEvents={selectable ? 'all' : 'none'}>{drawing.text || 'Note'}</text>;
  return null;
}

function ChartSurface({ symbol, interval, chartType, indicators, activeTool, drawings, selectedDrawing, onAddDrawing, onSelectDrawing, onMarketQuote, textAnnotation, onInterval, onChartType, showIndicators, onToggleIndicators }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const socketRef = useRef(null);
  const priceLineRef = useRef(null);
  const candleDataRef = useRef([]);
  const overlayRef = useRef(null);
  const drawingPointerIdRef = useRef(null);
  const draftRef = useRef(null);
  const loadedSymbolRef = useRef(symbol);
  const [loadState, setLoadState] = useState({ status: 'loading', error: '' });
  const [streamState, setStreamState] = useState('connecting');
  const [candles, setCandles] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [draft, setDraft] = useState(null);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [retryIndex, setRetryIndex] = useState(0);
  const chartTypeRef = useRef(chartType);

  const refreshPriceLine = useCallback((price) => {
    const chart = chartRef.current;
    const { candle, line } = seriesRef.current;
    if (!chart || !Number.isFinite(price) || price <= 0) return;
    const activeSeries = chartTypeRef.current === 'candles' ? candle : line;
    if (!activeSeries) return;
    if (priceLineRef.current) {
      try { priceLineRef.current.series.removePriceLine(priceLineRef.current.line); } catch { /* Series may have been removed during route cleanup. */ }
    }
    try {
      const priceLine = activeSeries.createPriceLine({ price, color: '#879fff', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Last' });
      priceLineRef.current = { series: activeSeries, line: priceLine };
    } catch { priceLineRef.current = null; }
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const chart = createChart(host, {
      width: host.clientWidth || 850,
      height: host.clientHeight || 460,
      layout: { background: { color: '#0b101a' }, textColor: '#a5afc0', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 11 },
      grid: { vertLines: { color: 'rgba(255,255,255,.035)' }, horzLines: { color: 'rgba(255,255,255,.045)' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(129,157,255,.48)', width: 1, labelBackgroundColor: '#526dbd' }, horzLine: { color: 'rgba(129,157,255,.48)', width: 1, labelBackgroundColor: '#526dbd' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,.09)', scaleMargins: { top: .08, bottom: .23 } },
      timeScale: { borderColor: 'rgba(255,255,255,.09)', timeVisible: true, secondsVisible: false, rightOffset: 5, barSpacing: 7, minBarSpacing: 2 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
    });
    const candle = chart.addCandlestickSeries({ upColor: '#089981', downColor: '#f23645', borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645', priceLineVisible: false, lastValueVisible: true });
    const line = chart.addLineSeries({ color: '#89a6ff', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false });
    const volume = chart.addHistogramSeries({ priceScaleId: 'volume', priceFormat: { type: 'volume' }, base: 0, lastValueVisible: false, priceLineVisible: false });
    const sma20 = chart.addLineSeries({ color: '#f6c85f', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const sma50 = chart.addLineSeries({ color: '#55b7ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ema20 = chart.addLineSeries({ color: '#c08cff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: .82, bottom: 0 }, visible: false, borderVisible: false });
    chartRef.current = chart;
    seriesRef.current = { candle, line, volume, sma20, sma50, ema20 };
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect?.width > 0 && rect?.height > 0) chart.applyOptions({ width: rect.width, height: rect.height });
      setViewportVersion((version) => version + 1);
    });
    resizeObserver.observe(host);
    const onCrosshairMove = (param) => {
      if (!param?.time) { setHovered(null); return; }
      const bar = param.seriesData?.get(candle);
      setHovered(bar && 'open' in bar ? { ...bar, time: param.time } : null);
    };
    chart.subscribeCrosshairMove(onCrosshairMove);
    const onRange = () => setViewportVersion((version) => version + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      socketRef.current?.close(); socketRef.current = null;
      resizeObserver.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
      chartRef.current = null; seriesRef.current = {}; priceLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartTypeRef.current = chartType;
    const { candle, line } = seriesRef.current;
    candle?.applyOptions({ visible: chartType === 'candles' });
    line?.applyOptions({ visible: chartType === 'line' });
    const last = candleDataRef.current.at(-1);
    if (last) refreshPriceLine(last.close);
  }, [chartType, refreshPriceLine]);

  useEffect(() => {
    const { volume, sma20, sma50, ema20 } = seriesRef.current;
    volume?.applyOptions({ visible: indicators.volume });
    sma20?.applyOptions({ visible: indicators.sma20 });
    sma50?.applyOptions({ visible: indicators.sma50 });
    ema20?.applyOptions({ visible: indicators.ema20 });
  }, [indicators]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const drawing = activeTool !== 'cursor';
    chart.applyOptions({
      handleScroll: { mouseWheel: true, pressedMouseMove: !drawing, horzTouchDrag: !drawing, vertTouchDrag: !drawing },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: !drawing }
    });
  }, [activeTool]);

  useEffect(() => {
    let active = true;
    let socket = null;
    const controller = new AbortController();
    socketRef.current?.close(); socketRef.current = null;
    setLoadState({ status: 'loading', error: '' });
    setStreamState('connecting'); setHovered(null); setCandles([]); candleDataRef.current = [];
    const { candle, line, volume, sma20, sma50, ema20 } = seriesRef.current;
    candle?.setData([]); line?.setData([]); volume?.setData([]); sma20?.setData([]); sma50?.setData([]); ema20?.setData([]);
    if (priceLineRef.current) {
      try { priceLineRef.current.series.removePriceLine(priceLineRef.current.line); } catch { /* Ignore chart disposal race. */ }
      priceLineRef.current = null;
    }

    const pushSeries = (data) => {
      const refs = seriesRef.current;
      const mapped = getChartIndicators(data);
      refs.candle?.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      refs.line?.setData(data.map(({ time, close }) => ({ time, value: close })));
      refs.volume?.setData(mapped.volume);
      refs.sma20?.setData(mapped.sma20); refs.sma50?.setData(mapped.sma50); refs.ema20?.setData(mapped.ema20);
    };

    const load = async () => {
      try {
        const rows = await api.klines(symbol, interval, 500, controller.signal);
        if (!active) return;
        const mapped = mapBinanceCandles(rows);
        if (!mapped.length) throw new Error('Binance returned no valid candles for this pair and timeframe.');
        candleDataRef.current = mapped;
        setCandles(mapped); pushSeries(mapped);
        if (loadedSymbolRef.current !== symbol) {
          chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
          loadedSymbolRef.current = symbol;
        }
        chartRef.current?.timeScale().fitContent();
        setLoadState({ status: 'ready', error: '' });
        const last = mapped.at(-1);
        refreshPriceLine(last.close);
        onMarketQuote({ symbol, price: last.close, candle: last, updatedAt: new Date() });
        try {
          socket = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@kline_${interval}`);
          socketRef.current = socket;
          socket.onopen = () => { if (active) setStreamState('live'); };
          socket.onerror = () => { if (active) setStreamState('delayed'); };
          socket.onclose = () => { if (active && socketRef.current === socket) setStreamState('delayed'); };
          socket.onmessage = (event) => {
            if (!active) return;
            try {
              const update = JSON.parse(event.data)?.k;
              if (!update) return;
              const next = mapBinanceCandles([[update.t, update.o, update.h, update.l, update.c, update.v]]);
              if (!next.length) return;
              const point = next[0];
              const data = candleDataRef.current;
              const lastPoint = data.at(-1);
              if (lastPoint?.time === point.time) data[data.length - 1] = point;
              else if (!lastPoint || point.time > lastPoint.time) data.push(point);
              else {
                const index = data.findIndex((item) => item.time === point.time);
                if (index < 0) return;
                data[index] = point;
              }
              setCandles([...data]); pushSeries(data);
              refreshPriceLine(point.close);
              onMarketQuote({ symbol, price: point.close, candle: point, updatedAt: new Date() });
            } catch { /* Ignore malformed stream messages and retain the last valid candles. */ }
          };
        } catch { setStreamState('delayed'); }
      } catch (requestError) {
        if (active && requestError.name !== 'AbortError') setLoadState({ status: 'error', error: requestError.message || 'Could not load Binance candles.' });
      }
    };
    load();
    api.ticker([symbol], controller.signal).then((rows) => {
      if (!active || !Array.isArray(rows)) return;
      const row = rows.find((item) => item.symbol === symbol);
      if (row) onMarketQuote({ symbol, price: Number(row.lastPrice), change: Number(row.priceChange), changePercent: Number(row.priceChangePercent), high: Number(row.highPrice), low: Number(row.lowPrice), volume: Number(row.volume), updatedAt: new Date() });
    }).catch(() => {});
    return () => { active = false; controller.abort(); if (socket) { socket.onmessage = null; socket.close(); } if (socketRef.current === socket) socketRef.current = null; };
  }, [symbol, interval, retryIndex, onMarketQuote, refreshPriceLine]);

  const currentBar = hovered || candles.at(-1) || null;
  const drawingChart = chartRef.current;
  const candleSeries = seriesRef.current.candle;
  void viewportVersion;

  function readPoint(event) {
    const svg = overlayRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current.candle;
    if (!svg || !chart || !series) return null;
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !svg.clientWidth || !svg.clientHeight) return null;
    // Use the SVG's own coordinate space so the pointer and rendered annotation
    // stay aligned if the stage is scaled by a responsive layout or browser zoom.
    const screenMatrix = svg.getScreenCTM();
    if (!screenMatrix) return null;
    const svgPoint = svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const local = svgPoint.matrixTransform(screenMatrix.inverse());
    const x = local.x;
    const y = local.y;
    const time = chart.timeScale().coordinateToTime(x);
    const price = series.coordinateToPrice(y);
    const timestamp = typeof time === 'number' ? time : time && typeof time === 'object' ? Date.UTC(time.year, time.month - 1, time.day) / 1000 : NaN;
    return Number.isFinite(timestamp) && Number.isFinite(price) ? { time: timestamp, price } : null;
  }

  function handleDrawingPointerDown(event) {
    if (activeTool === 'cursor') return;
    const point = readPoint(event);
    if (!point) return;
    event.preventDefault(); event.stopPropagation();
    overlayRef.current?.focus();
    try {
      overlayRef.current?.setPointerCapture?.(event.pointerId);
      drawingPointerIdRef.current = event.pointerId;
    } catch { drawingPointerIdRef.current = null; }
    if (activeTool === 'horizontal' || activeTool === 'vertical' || activeTool === 'text') {
      onAddDrawing({ id: newDrawingId(), type: activeTool, symbol, points: [point], ...(activeTool === 'text' ? { text: textAnnotation || 'Note' } : {}) });
      return;
    }
    const nextDraft = { id: newDrawingId(), type: activeTool, symbol, points: [point], text: textAnnotation };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function handleDrawingPointerMove(event) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const point = readPoint(event);
    if (!point) return;
    let nextDraft;
    if (currentDraft.type === 'brush') {
      const last = currentDraft.points.at(-1);
      const chart = chartRef.current;
      const lastX = chart?.timeScale().timeToCoordinate(last.time);
      const lastY = seriesRef.current.candle?.priceToCoordinate(last.price);
      if (lastX !== null && lastY !== null) {
        const svg = overlayRef.current;
        const svgPoint = svg?.createSVGPoint();
        const screenMatrix = svg?.getScreenCTM();
        if (svgPoint && screenMatrix) {
          svgPoint.x = event.clientX;
          svgPoint.y = event.clientY;
          const local = svgPoint.matrixTransform(screenMatrix.inverse());
          if (Math.hypot(local.x - lastX, local.y - lastY) < 2) return;
        }
      }
      nextDraft = { ...currentDraft, points: [...currentDraft.points, point] };
    } else nextDraft = { ...currentDraft, points: [currentDraft.points[0], point] };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  function releaseDrawingPointer(pointerId) {
    if (pointerId == null) return;
    const svg = overlayRef.current;
    if (drawingPointerIdRef.current === pointerId) drawingPointerIdRef.current = null;
    if (!svg?.hasPointerCapture?.(pointerId)) return;
    try { svg.releasePointerCapture(pointerId); } catch { /* The browser may already have released capture. */ }
  }

  function handleDrawingPointerUp(event) {
    const currentDraft = draftRef.current;
    const finalPoint = currentDraft && readPoint(event);
    const completed = currentDraft && finalPoint
      ? { ...currentDraft, points: currentDraft.type === 'brush'
        ? [...currentDraft.points, finalPoint]
        : [currentDraft.points[0], finalPoint] }
      : currentDraft;
    if (completed?.points.length > 1) {
      const [start, end] = completed.points;
      if (end && (start.time !== end.time || start.price !== end.price)) onAddDrawing(completed);
    }
    draftRef.current = null;
    setDraft(null);
    releaseDrawingPointer(event.pointerId);
  }

  function handleDrawingPointerCancel(event) {
    draftRef.current = null;
    setDraft(null);
    releaseDrawingPointer(event.pointerId);
  }

  function handleLostPointerCapture(event) {
    if (drawingPointerIdRef.current !== event.pointerId) return;
    drawingPointerIdRef.current = null;
    draftRef.current = null;
    setDraft(null);
  }

  function handleOverlayKeyDown(event) {
    if (event.key === 'Escape' && draft) {
      event.preventDefault();
      draftRef.current = null;
      setDraft(null);
      releaseDrawingPointer(drawingPointerIdRef.current);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawing) {
      event.preventDefault(); onSelectDrawing(`delete:${selectedDrawing}`);
    }
  }

  const renderDrawing = (drawing, selectable) => <DrawingShape key={drawing.id} drawing={{ ...drawing, onSelect: (id) => { onSelectDrawing(id); overlayRef.current?.focus(); } }} chart={drawingChart} candleSeries={candleSeries} selected={drawing.id === selectedDrawing} selectable={selectable} />;

  return <section className="tv-chart-main" aria-label={`${symbol} ${interval} chart workspace`}>
    <div className="tv-chart-toolbar">
      <div className="tv-symbol-search"><span className="tv-symbol-mark">{symbol.slice(0, 1)}</span><b>{symbol}</b><span className="tv-market-type">BINANCE · SPOT</span></div>
      <div className="tv-timeframes" role="group" aria-label="Chart timeframe">
        {timeframes.map((timeframe) => <button type="button" key={timeframe.value} onClick={() => onInterval(timeframe.value)} className={interval === timeframe.value ? 'active' : ''} aria-pressed={interval === timeframe.value}>{timeframe.label}</button>)}
      </div>
      <div className="tv-chart-type" role="group" aria-label="Chart type">
        <button type="button" className={chartType === 'candles' ? 'active' : ''} onClick={() => onChartType('candles')} aria-pressed={chartType === 'candles'}><CandlestickChart size={14} /><span>Candles</span></button>
        <button type="button" className={chartType === 'line' ? 'active' : ''} onClick={() => onChartType('line')} aria-pressed={chartType === 'line'}><LineChart size={14} /><span>Line</span></button>
      </div>
      <div className="tv-indicator-menu">
        <button type="button" className={`tv-indicator-trigger ${showIndicators ? 'active' : ''}`} onClick={() => onToggleIndicators()} aria-expanded={showIndicators}><SlidersHorizontal size={14} /><span>Indicators</span><ChevronDown size={12} /></button>
        {showIndicators && <div className="tv-indicator-popover">{indicatorChoices.map((item) => <label key={item.id}><span className="tv-indicator-color" style={{ background: item.color }} />{item.label}<input type="checkbox" checked={indicators[item.id]} onChange={() => onToggleIndicators(item.id)} /></label>)}</div>}
      </div>
      <button type="button" className="tv-fit-button" onClick={() => chartRef.current?.timeScale().fitContent()} title="Fit chart to data">Fit</button>
    </div>
    <div className="tv-chart-readout" aria-live="polite">
      <div className="tv-price-readout"><strong>{money(currentBar?.close, 4)}</strong><span>USDT</span></div>
      <div className="tv-ohlc"><span>O <b>{money(currentBar?.open, 4)}</b></span><span>H <b>{money(currentBar?.high, 4)}</b></span><span>L <b>{money(currentBar?.low, 4)}</b></span><span>C <b>{money(currentBar?.close, 4)}</b></span><span>Vol <b>{currentBar?.volume === undefined ? '—' : money(currentBar.volume, 2)}</b></span></div>
      <span className={`tv-stream-status ${streamState === 'live' ? 'is-live' : ''}`}><i />{streamState === 'live' ? 'LIVE' : streamState === 'connecting' ? 'CONNECTING' : 'LIVE FEED UNAVAILABLE'}</span>
    </div>
    <div className="tv-chart-stage">
      <div className="tv-chart-canvas" ref={hostRef} />
      <svg ref={overlayRef} className={`tv-drawing-overlay ${activeTool === 'cursor' ? 'cursor-mode' : 'drawing-mode'}`} tabIndex={0} role="application" aria-label="Chart annotations" onPointerDown={handleDrawingPointerDown} onPointerMove={handleDrawingPointerMove} onPointerUp={handleDrawingPointerUp} onPointerCancel={handleDrawingPointerCancel} onLostPointerCapture={handleLostPointerCapture} onKeyDown={handleOverlayKeyDown}>
        <defs><marker id="tv-arrowhead" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto"><polygon points="0 0, 9 3.5, 0 7" fill="#9eb5ff" /></marker></defs>
        <rect className="tv-drawing-hit-area" x="0" y="0" width="100%" height="100%" fill="transparent" pointerEvents="all" />
        {drawings.map((drawing) => renderDrawing(drawing, activeTool === 'cursor'))}
        {draft && renderDrawing(draft, false)}
      </svg>
      {loadState.status === 'loading' && <div className="tv-chart-state"><LoadingState label={`Loading real Binance ${interval} candles…`} /></div>}
      {loadState.status === 'error' && <div className="tv-chart-state"><ErrorState message={loadState.error} onRetry={() => setRetryIndex((value) => value + 1)} /></div>}
    </div>
    <div className="tv-chart-footer"><span>{symbol} · {interval} · Binance market data</span><span>{candles.length ? `${candles.length.toLocaleString()} bars` : '—'}</span><span>Wheel to zoom · drag to pan</span></div>
  </section>;
}

function DrawingToolbar({ activeTool, onTool, selectedDrawing, drawingCount, onDelete, textAnnotation, onTextChange }) {
  return <aside className="tv-drawing-toolbar" aria-label="Chart drawing tools">
    <div className="tv-drawing-tools">{tools.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={activeTool === id ? 'active' : ''} onClick={() => onTool(id)} title={label} aria-label={label} aria-pressed={activeTool === id}><Icon size={16} /></button>)}</div>
    {activeTool === 'text' && <input className="tv-drawing-text-input" aria-label="Text annotation" maxLength={48} value={textAnnotation} onChange={(event) => onTextChange(event.target.value)} />}
    <div className="tv-drawing-divider" />
    <button type="button" className="tv-delete-drawing" onClick={onDelete} disabled={!selectedDrawing && drawingCount === 0} title={selectedDrawing ? 'Delete selected drawing' : 'Delete most recent drawing'} aria-label={selectedDrawing ? 'Delete selected drawing' : 'Delete most recent drawing'}><Trash2 size={16} /></button>
    <span className="tv-drawing-count">{drawingCount}</span>
  </aside>;
}

function SignInPrompt({ symbol, compact = false }) {
  const from = { pathname: `/chart/${symbol}`, search: '?tab=trade' };
  return <div className={`tv-signin-prompt ${compact ? 'compact' : ''}`}>
    <span className="tv-panel-icon"><UserRound size={17} /></span><h3>Sign in to continue</h3>
    <p>Sign in to use your saved market tools and paper portfolio.</p>
    <Link className="button button-primary" to="/signin" state={{ from }}>Sign in and return to Trade</Link>
    <small>After sign-in, this chart will reopen with the Trade tab selected.</small>
  </div>;
}

function WatchlistTab({ selectedSymbol, onSelectSymbol }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) { setItems(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'].map((symbol) => ({ symbol, displayName: symbol, _id: symbol }))); return; }
    setBusy(true); setError('');
    try { const response = await api.watchlist(); setItems(response.data?.items || []); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  async function add(event) {
    event.preventDefault();
    const symbol = query.trim().toUpperCase().replace('/', '');
    if (!/^[A-Z0-9]{2,20}USDT$/.test(symbol)) { setError('Enter a valid Binance USDT pair, such as BTCUSDT.'); return; }
    if (!user) { setError('Sign in to save a personal watchlist.'); return; }
    setBusy(true); setError('');
    try { await api.addToWatchlist({ symbol, assetType: 'crypto', exchange: 'BINANCE', provider: 'binance', displayName: symbol }); setQuery(''); await load(); }
    catch (requestError) { setError(requestError.message); setBusy(false); }
  }
  async function remove(item) {
    if (!user) return;
    setBusy(true); setError('');
    try { await api.removeFromWatchlist(item._id); await load(); }
    catch (requestError) { setError(requestError.message); setBusy(false); }
  }
  return <div className="tv-tab-content">
    <div className="tv-tab-subhead"><b>My watchlist</b><button type="button" className="tv-icon-button" onClick={load} title="Refresh watchlist" disabled={busy}><RefreshCw size={13} /></button></div>
    <form className="tv-watchlist-add" onSubmit={add}><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Add BTCUSDT" aria-label="Add pair to watchlist" /><button type="submit" disabled={busy}><Plus size={14} /></button></form>
    {error && <p className="tv-inline-error" role="alert">{error}</p>}
    {busy && !items.length ? <LoadingState label="Loading your watchlist…" /> : <div className="tv-watchlist-list">{items.map((item) => <div className={`tv-watchlist-row ${item.symbol === selectedSymbol ? 'active' : ''}`} key={item._id || item.symbol}>
      <button type="button" className="tv-watchlist-select" onClick={() => onSelectSymbol(item.symbol)}><span className="tv-coin-dot">{item.symbol.slice(0, 1)}</span><span><b>{item.displayName || item.symbol}</b><small>{item.symbol}</small></span><small>USDT</small></button>
      {user && <button type="button" className="tv-watch-remove" onClick={() => remove(item)} title={`Remove ${item.symbol}`} aria-label={`Remove ${item.symbol}`} disabled={busy}><X size={13} /></button>}
    </div>)}</div>}
    {!user && <Link className="tv-muted-link" to="/signin">Sign in to sync your watchlist</Link>}
  </div>;
}

function TradeTab({ chartSymbol, portfolio, portfolioLoading, refreshPortfolio }) {
  const { user, logout } = useAuth();
  const [symbol, setSymbol] = useState(chartSymbol);
  const [side, setSide] = useState('buy');
  const [mode, setMode] = useState(DEFAULT_PAPER_ORDER.mode);
  const [input, setInput] = useState(DEFAULT_PAPER_ORDER.input);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteError, setQuoteError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pendingOrderRef = useRef(null);
  useEffect(() => { setSymbol(chartSymbol); }, [chartSymbol]);
  useEffect(() => {
    let active = true, inFlight = false;
    setQuote(null); setQuoteError(''); setQuoteLoading(true);
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const rows = await api.ticker([symbol]);
        const row = Array.isArray(rows) ? rows.find((item) => item.symbol === symbol) : null;
        const price = Number(row?.lastPrice);
        if (!Number.isFinite(price) || price <= 0) throw new Error(`A live Binance quote for ${symbol} is unavailable.`);
        if (active) { setQuote({ symbol, price, updatedAt: new Date() }); setQuoteError(''); }
      } catch (requestError) { if (active) { setQuote(null); setQuoteError(requestError.message); } }
      finally { inFlight = false; if (active) setQuoteLoading(false); }
    };
    refresh(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [symbol]);
  const preview = useMemo(() => getPaperOrderPreview({ mode, input, quote, symbol }), [mode, input, quote, symbol]);
  const holding = portfolio?.holdings?.find((item) => item.symbol === symbol);
  const canSubmit = canSubmitPaperOrder({ mode, input, quote, symbol, side, availableCash: portfolio?.cash, holdingQuantity: holding?.quantity, busy: busy || portfolioLoading });
  const inputMessage = getPaperOrderInputMessage(mode, input);
  const qty = getPaperOrderExecutionQuantity({ mode, input, quote, symbol });
  const from = { pathname: `/chart/${chartSymbol}`, search: '?tab=trade' };
  function changeMode(nextMode) { setInput(getPaperOrderModeInput({ mode, nextMode, input, quote, symbol })); setMode(nextMode); }
  async function submit(event) {
    event.preventDefault();
    if (lock.current || !canSubmit) return;
    lock.current = true; setBusy(true); setMessage(''); setError('');
    const amount = Number(input);
    const order = { symbol, side, ...(mode === 'quote' ? { amountUsdt: amount } : { quantity: amount }) };
    try {
      const response = await api.paperOrder(order, getPaperOrderIdempotencyKey(order, pendingOrderRef));
      clearPaperOrderIdempotencyKey(order, pendingOrderRef);
      setMessage(response.trade
        ? `${response.trade.side.toUpperCase()} paper order filled: ${money(response.trade.notional, 4)} USDT.`
        : 'This order was already processed. Your paper portfolio is up to date.');
      setInput('');
      await refreshPortfolio();
    } catch (requestError) {
      if (requestError.status === 401) {
        setError('Your sign-in session expired. Sign in again to place a paper order.');
        try { await logout(); } catch { /* AuthContext clears the expired local session in its finally block. */ }
      } else setError(requestError.message || 'Paper order could not be placed.');
    } finally { lock.current = false; setBusy(false); }
  }
  if (!user) return <div className="tv-tab-content"><SignInPrompt symbol={chartSymbol} compact /></div>;
  return <div className="tv-tab-content tv-trade-tab">
    {portfolioLoading && !portfolio && <LoadingState label="Loading your paper balance…" />}
    {error && <div className="tv-callout error" role="alert">{error}{!user && <Link to="/signin" state={{ from }}>Sign in</Link>}</div>}
    {message && <div className="tv-callout success" role="status">{message}</div>}
    <div className="tv-trade-title"><div><b>Paper market order</b><small>Simulated only · no Binance transaction</small></div><span className="tv-paper-tag">PAPER</span></div>
    <div className="tv-side-toggle"><button type="button" className={side === 'buy' ? 'buy active' : ''} onClick={() => { setSide('buy'); setError(''); }}>Buy</button><button type="button" className={side === 'sell' ? 'sell active' : ''} onClick={() => { setSide('sell'); setError(''); }}>Sell</button></div>
    <label className="tv-form-label">Trading pair<select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{pairs.map((pair) => <option key={pair} value={pair}>{pair.replace('USDT', '')} / USDT</option>)}</select></label>
    <div className="tv-order-mode"><button type="button" className={mode === 'quote' ? 'active' : ''} onClick={() => changeMode('quote')}>Amount (USDT)</button><button type="button" className={mode === 'quantity' ? 'active' : ''} onClick={() => changeMode('quantity')}>Quantity</button></div>
    <label className="tv-form-label">{mode === 'quote' ? 'Order amount (USDT)' : `Quantity (${symbol.replace('USDT', '')})`}<input type="number" min={mode === 'quote' ? '0.01' : '0.00000001'} max={mode === 'quote' ? '1000000000' : '1000000'} step={mode === 'quote' ? '0.01' : '0.00000001'} placeholder={mode === 'quote' ? '100.00' : '0.001'} value={input} onChange={(event) => setInput(event.target.value)} /></label>
    <div className="tv-trade-market"><span>Current Binance price</span><b>{quote?.symbol === symbol && isPaperQuoteFresh(quote) ? `${money(quote.price, 4)} USDT` : quoteLoading ? 'Loading quote…' : 'Unavailable'}</b></div>
    {quoteError && <p className="tv-inline-error" role="alert">{quoteError}</p>}
    <div className="tv-trade-estimates"><span>Estimated order value</span><b>{preview ? `${money(preview.value, 4)} USDT` : quoteLoading ? 'Loading live quote…' : quoteError ? 'Quote unavailable' : quote?.symbol === symbol && !isPaperQuoteFresh(quote) ? 'Quote is stale; refreshing…' : inputMessage || 'Waiting for a live quote'}</b><span>Estimated quantity</span><b>{preview ? `${money(preview.quantity, 8)} ${symbol.replace('USDT', '')}` : '—'}</b></div>
    {portfolio && <div className="tv-available-balance"><span>{side === 'buy' ? 'Available cash' : `Available ${symbol.replace('USDT', '')}`}</span><b>{side === 'buy' ? `${money(portfolio.cash, 2)} USDT` : `${money(holding?.quantity || 0, 8)} ${symbol.replace('USDT', '')}`}</b></div>}
    {side === 'buy' && preview && portfolio && preview.value > portfolio.cash && <p className="tv-inline-error">Insufficient cash for this order.</p>}
    {side === 'sell' && preview && portfolio && !canSubmit && <p className="tv-inline-error">Insufficient {symbol.replace('USDT', '')} holdings for this order.</p>}
    <button type="button" className={`tv-order-submit ${side}`} disabled={!canSubmit} onClick={submit}>{busy ? 'Submitting paper order…' : `Place Paper ${side === 'buy' ? 'Buy' : 'Sell'}`}</button>
    <p className="tv-trade-disclaimer">The server fetches the execution price and validates your balance. This is a simulated trade.</p>
    <Link className="tv-muted-link" to="/paper-trading">Open full Paper Trading workspace <ExternalLink size={12} /></Link>
  </div>;
}

function PortfolioTab({ portfolio, loading, error, symbol, onRefresh }) {
  const { user } = useAuth();
  if (!user) return <div className="tv-tab-content"><SignInPrompt symbol={symbol} compact /></div>;
  if (loading && !portfolio) return <div className="tv-tab-content"><LoadingState label="Loading your paper portfolio…" /></div>;
  if (error && !portfolio) return <div className="tv-tab-content"><ErrorState message={error} onRetry={onRefresh} /></div>;
  if (!portfolio) return <div className="tv-tab-content"><LoadingState label="Loading your paper portfolio…" /></div>;
  return <div className="tv-tab-content tv-portfolio-tab">
    <div className="tv-tab-subhead"><b>Paper portfolio</b><button type="button" className="tv-icon-button" onClick={onRefresh} title="Refresh portfolio"><RefreshCw size={13} /></button></div>
    {error && <p className="tv-inline-error">{error}</p>}
    <div className="tv-portfolio-stats"><div><span>Available cash</span><b>{money(portfolio.cash, 2)} USDT</b></div><div><span>Portfolio value</span><b>{portfolio.equity === null ? 'Unavailable' : `${money(portfolio.equity, 2)} USDT`}</b></div><div><span>Realized P/L</span><b className={portfolio.realizedPnl >= 0 ? 'positive' : 'negative'}>{money(portfolio.realizedPnl, 2)} USDT</b></div><div><span>Unrealized P/L</span><b className={portfolio.unrealizedPnl === null ? '' : portfolio.unrealizedPnl >= 0 ? 'positive' : 'negative'}>{portfolio.unrealizedPnl === null ? 'Unavailable' : `${money(portfolio.unrealizedPnl, 2)} USDT`}</b></div></div>
    <div className="tv-subsection-title">Open positions</div>
    {!portfolio.holdings.length ? <div className="tv-empty-small">No open positions.</div> : <div className="tv-compact-list">{portfolio.holdings.map((item) => <div key={item.symbol}><span><b>{item.symbol}</b><small>{money(item.quantity, 8)} · entry {money(item.averageEntryPrice, 4)}</small></span><span><b>{item.marketValue === null ? 'Unavailable' : `${money(item.marketValue, 2)} USDT`}</b><small className={(item.unrealizedPnl || 0) >= 0 ? 'positive' : 'negative'}>{item.unrealizedPnl === null ? 'P/L unavailable' : `${money(item.unrealizedPnl, 2)} USDT`}</small></span></div>)}</div>}
    <div className="tv-subsection-title">Recent paper trades</div>
    {!portfolio.trades.length ? <div className="tv-empty-small">No paper trades yet.</div> : <div className="tv-compact-list">{[...portfolio.trades].reverse().slice(0, 8).map((trade) => <div key={trade.orderId}><span><b>{trade.side.toUpperCase()} · {trade.symbol}</b><small>{formatChartTime(Math.floor(new Date(trade.executedAt).getTime() / 1000))}</small></span><span><b>{money(trade.notional, 2)} USDT</b><small>{money(trade.quantity, 8)} @ {money(trade.executionPrice, 4)}</small></span></div>)}</div>}
    <Link className="tv-muted-link" to="/paper-trading">View complete portfolio and trade history <ExternalLink size={12} /></Link>
  </div>;
}

function AlertsTab({ symbol }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [target, setTarget] = useState('');
  const [condition, setCondition] = useState('greater_than');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) { setAlerts([]); return; }
    setBusy(true); setError('');
    try { const response = await api.alerts(); setAlerts(response.data || []); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);
  async function submit(event) {
    event.preventDefault();
    if (!user) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api.createAlert({ symbol, assetType: 'crypto', condition, targetValue: Number(target) });
      setMessage(`Alert created for ${symbol}.`); setTarget(''); await load();
    } catch (requestError) { setError(requestError.message); setBusy(false); }
  }
  if (!user) return <div className="tv-tab-content"><SignInPrompt symbol={symbol} compact /></div>;
  return <div className="tv-tab-content">
    <div className="tv-tab-subhead"><b>Price alerts</b><button type="button" className="tv-icon-button" onClick={load} disabled={busy} title="Refresh alerts"><RefreshCw size={13} /></button></div>
    <form className="tv-alert-form" onSubmit={submit}><label>Pair<select value={symbol} onChange={() => {}} disabled>{<option value={symbol}>{symbol}</option>}</select></label><label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}><option value="greater_than">Price rises above</option><option value="less_than">Price falls below</option></select></label><label>Target price (USDT)<input type="number" required min="0.00000001" step="any" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Target price" /></label><button className="tv-order-submit" disabled={busy || !target}>{busy ? 'Saving…' : <><BellPlus size={14} /> Create alert</>}</button></form>
    {error && <p className="tv-inline-error" role="alert">{error}</p>}{message && <p className="tv-inline-success" role="status">{message}</p>}
    <div className="tv-subsection-title">Saved alerts</div>
    {busy && !alerts.length ? <LoadingState label="Loading your alerts…" /> : alerts.length ? <div className="tv-compact-list">{alerts.map((alert) => <div key={alert._id}><span><b>{alert.symbol}</b><small>{alert.triggerCondition?.replace('_', ' ') || 'Price condition'}</small></span><span><b>{money(alert.targetValue, 4)} USDT</b><small>{alert.isActive ? 'Active' : 'Paused'}</small></span></div>)}</div> : <div className="tv-empty-small">No saved alerts.</div>}
    <Link className="tv-muted-link" to="/markets/crypto">Manage more alerts in your market workspace <ExternalLink size={12} /></Link>
  </div>;
}

function DetailsTab({ symbol, quote }) {
  const valid = quote?.symbol === symbol;
  const candle = valid ? quote.candle : null;
  return <div className="tv-tab-content">
    <div className="tv-tab-subhead"><b>Market details</b><span className="tv-market-badge">BINANCE SPOT</span></div>
    <div className="tv-detail-symbol"><span className="tv-symbol-mark">{symbol.slice(0, 1)}</span><div><b>{symbol}</b><small>{symbol.replace('USDT', ' / USDT')}</small></div></div>
    <div className="tv-detail-price">{valid ? `${money(quote.price, 4)} USDT` : 'Loading quote…'}</div>
    {valid && Number.isFinite(quote.changePercent) && <div className={`tv-detail-change ${quote.changePercent >= 0 ? 'positive' : 'negative'}`}>{quote.changePercent >= 0 ? '+' : ''}{money(quote.changePercent)}% <small>24h change</small></div>}
    <div className="tv-detail-grid"><span>24h high<b>{valid && Number.isFinite(quote.high) ? money(quote.high, 4) : '—'}</b></span><span>24h low<b>{valid && Number.isFinite(quote.low) ? money(quote.low, 4) : '—'}</b></span><span>24h volume<b>{valid && Number.isFinite(quote.volume) ? money(quote.volume, 2) : candle ? money(candle.volume, 2) : '—'}</b></span><span>Last candle close<b>{candle ? money(candle.close, 4) : '—'}</b></span></div>
    <p className="tv-panel-footnote">Prices and candle data come from Binance. Volume uses the selected timeframe unless 24-hour ticker volume is available.</p>
  </div>;
}

function ProfileTab({ symbol }) {
  const { user } = useAuth();
  return <div className="tv-tab-content">
    <div className="tv-tab-subhead"><b>Profile</b><UserRound size={15} /></div>
    {user ? <><div className="tv-profile-card"><span className="tv-profile-avatar">{(user.name || user.email || 'T').slice(0, 1).toUpperCase()}</span><div><b>{user.name || 'Trader'}</b><small>{user.email}</small></div></div><Link className="tv-profile-link" to="/paper-trading"><Wallet size={14} /> Paper Trading workspace</Link><Link className="tv-profile-link" to="/markets/crypto"><Search size={14} /> Crypto market overview</Link><div className="tv-profile-note"><CircleHelp size={14} /> Your watchlist, alerts, and paper portfolio are private to your account.</div></> : <SignInPrompt symbol={symbol} compact />}
  </div>;
}

export default function ChartWorkspace() {
  const { symbol: routeSymbol } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const symbol = (routeSymbol || 'BTCUSDT').toUpperCase();
  const [interval, setInterval] = useState('1h');
  const [chartType, setChartType] = useState('candles');
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(location.search).get('tab') === 'trade' ? 'trade' : 'watchlist');
  const [activeTool, setActiveTool] = useState('cursor');
  const [indicators, setIndicators] = useState({ sma20: false, sma50: false, ema20: false, volume: true });
  const [showIndicators, setShowIndicators] = useState(false);
  const [textAnnotation, setTextAnnotation] = useState('Note');
  const [drawingsBySymbol, setDrawingsBySymbol] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tv_react_chart_drawings') || '{}'); } catch { return {}; }
  });
  const [selectedDrawing, setSelectedDrawing] = useState(null);
  const [marketQuote, setMarketQuote] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioError, setPortfolioError] = useState('');
  const portfolioLock = useRef(false);
  const drawings = drawingsBySymbol[symbol] || [];
  const asset = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
  const returnToTrade = { pathname: `/chart/${symbol}`, search: '?tab=trade' };

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) setActiveTab(requestedTab);
  }, [location.search]);
  useEffect(() => { setSelectedDrawing(null); }, [symbol]);
  useEffect(() => { localStorage.setItem('tv_react_chart_drawings', JSON.stringify(drawingsBySymbol)); }, [drawingsBySymbol]);
  const refreshPortfolio = useCallback(async () => {
    if (!user || portfolioLock.current) return null;
    portfolioLock.current = true; setPortfolioLoading(true); setPortfolioError('');
    try { const response = await api.paperPortfolio(); setPortfolio(response.data); return response.data; }
    catch (requestError) { setPortfolioError(requestError.message); throw requestError; }
    finally { portfolioLock.current = false; setPortfolioLoading(false); }
  }, [user]);
  useEffect(() => {
    if (!user) { setPortfolio(null); setPortfolioError(''); return; }
    if (activeTab === 'trade' || activeTab === 'portfolio') refreshPortfolio().catch(() => {});
  }, [user, activeTab, refreshPortfolio]);

  const updateDrawings = useCallback((update) => {
    setDrawingsBySymbol((previous) => {
      const current = previous[symbol] || [];
      const next = typeof update === 'function' ? update(current) : update;
      return { ...previous, [symbol]: next };
    });
  }, [symbol]);
  const addDrawing = useCallback((drawing) => updateDrawings((current) => [...current, { ...drawing, symbol }]), [symbol, updateDrawings]);
  const selectOrDeleteDrawing = useCallback((selection) => {
    if (selection.startsWith('delete:')) {
      const id = selection.slice(7);
      updateDrawings((current) => current.filter((item) => item.id !== id));
      setSelectedDrawing(null);
    } else setSelectedDrawing(selection);
  }, [updateDrawings]);
  const deleteDrawing = useCallback(() => {
    if (!drawings.length) return;
    const id = selectedDrawing || drawings.at(-1).id;
    updateDrawings((current) => current.filter((item) => item.id !== id));
    setSelectedDrawing(null);
  }, [drawings, selectedDrawing, updateDrawings]);
  function toggleIndicator(indicator) { setIndicators((current) => ({ ...current, [indicator]: !current[indicator] })); }
  const selectSymbol = useCallback((nextSymbol) => {
    const normalized = String(nextSymbol || '').trim().toUpperCase().replace('/', '');
    if (!/^[A-Z0-9]{2,18}USDT$/.test(normalized)) return;
    setMarketQuote(null);
    navigate(`/chart/${normalized}${location.search || ''}`);
  }, [navigate, location.search]);
  const mergeMarketQuote = useCallback((next) => {
    setMarketQuote((previous) => previous?.symbol === next.symbol ? { ...previous, ...next } : next);
  }, []);

  const content = useMemo(() => {
    if (activeTab === 'watchlist') return <WatchlistTab selectedSymbol={symbol} onSelectSymbol={selectSymbol} />;
    if (activeTab === 'trade') return <TradeTab chartSymbol={symbol} portfolio={portfolio} portfolioLoading={portfolioLoading} refreshPortfolio={refreshPortfolio} />;
    if (activeTab === 'portfolio') return <PortfolioTab portfolio={portfolio} loading={portfolioLoading} error={portfolioError} symbol={symbol} onRefresh={() => refreshPortfolio().catch(() => {})} />;
    if (activeTab === 'alerts') return <AlertsTab symbol={symbol} />;
    if (activeTab === 'details') return <DetailsTab symbol={symbol} quote={marketQuote} />;
    return <ProfileTab symbol={symbol} />;
  }, [activeTab, symbol, portfolio, portfolioLoading, refreshPortfolio, portfolioError, marketQuote]);

  return <main className="tv-chart-route">
    <MarketStrip />
    <div className="tv-chart-workspace">
      <DrawingToolbar activeTool={activeTool} onTool={setActiveTool} selectedDrawing={selectedDrawing} drawingCount={drawings.length} onDelete={deleteDrawing} textAnnotation={textAnnotation} onTextChange={setTextAnnotation} />
      <div className="tv-chart-center">
        <div className="tv-route-pair-bar">
          <form className="tv-route-pair-form" onSubmit={(event) => { event.preventDefault(); selectSymbol(event.currentTarget.elements.pair.value); }}>
            <span className="tv-symbol-mark">{asset.slice(0, 1)}</span><input name="pair" aria-label="Select chart symbol" list="tv-chart-pair-options" defaultValue={symbol} key={symbol} /><datalist id="tv-chart-pair-options">{pairs.map((pair) => <option value={pair} key={pair} />)}</datalist><button type="submit" title="Open pair"><Search size={14} /></button>
          </form>
          <div className="tv-route-title"><strong>{symbol}</strong><span>· Binance spot market</span></div>
          <div className={`tv-route-last ${Number(marketQuote?.changePercent) >= 0 ? 'positive' : 'negative'}`}>{marketQuote?.symbol === symbol ? `${money(marketQuote.price, 4)} USDT` : 'Loading price…'}</div>
          <button type="button" className={`tv-add-watch ${activeTab === 'watchlist' ? 'active' : ''}`} onClick={() => setActiveTab('watchlist')} title="Open watchlist"><Star size={15} /></button>
          <Link className="tv-full-paper-link" to="/paper-trading"><TrendingUp size={14} /><span>Paper Trading</span></Link>
        </div>
        <div className="tv-chart-layout">
          <ChartSurface symbol={symbol} interval={interval} chartType={chartType} indicators={indicators} activeTool={activeTool} drawings={drawings} selectedDrawing={selectedDrawing} onAddDrawing={addDrawing} onSelectDrawing={selectOrDeleteDrawing} onMarketQuote={mergeMarketQuote} textAnnotation={textAnnotation} onInterval={setInterval} onChartType={setChartType} showIndicators={showIndicators} onToggleIndicators={(indicator) => indicator ? toggleIndicator(indicator) : setShowIndicators((value) => !value)} />
        </div>
      </div>
      <aside className="tv-chart-sidebar">
        <div className="tv-sidebar-tabs" role="tablist" aria-label="Chart workspace panels">{tabs.map(({ id, label, icon: Icon }) => <button type="button" role="tab" key={id} id={`tv-tab-${id}`} aria-selected={activeTab === id} aria-controls="tv-tab-panel" className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}><Icon size={15} /><span>{label}</span></button>)}</div>
        <div id="tv-tab-panel" className="tv-sidebar-panel" role="tabpanel" aria-labelledby={`tv-tab-${activeTab}`} key={activeTab}>{content}</div>
      </aside>
    </div>
  </main>;
}
