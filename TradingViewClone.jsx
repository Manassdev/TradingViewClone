import React, { useMemo, useState } from "react";
import {
  Search, Star, Bell, Settings, Maximize2, ChevronDown,
  TrendingUp, Crosshair, Ruler, Type, Trash2, Undo2,
  Camera, LayoutGrid, Minus, Plus, ArrowUpRight, ArrowDownRight
} from "lucide-react";

/**
 * TradingView Clone — UI shell only.
 * No live data, no chart lib, no websockets, no auth, no state mgmt.
 * Candles are static mock data rendered as SVG so the layout has something
 * believable to sit around while chart/API/websocket teammates wire in the
 * real thing (TradingView Lightweight Charts, live feeds, etc.)
 */

const COLORS = {
  bg0: "#131722",       // page canvas
  bg1: "#1A1E29",       // panels
  bg2: "#1E222D",       // cards / rows
  border: "#2A2E39",
  borderStrong: "#363A45",
  textPrimary: "#D1D4DC",
  textSecondary: "#787B86",
  textMuted: "#5D606B",
  bull: "#26A69A",
  bear: "#EF5350",
  accent: "#2962FF",
};

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const WATCHLIST = [
  { symbol: "BTCUSD", name: "Bitcoin", price: 67432.5, change: 2.14 },
  { symbol: "ETHUSD", name: "Ethereum", price: 3521.2, change: -0.87 },
  { symbol: "AAPL", name: "Apple Inc.", price: 231.14, change: 0.42 },
  { symbol: "TSLA", name: "Tesla Inc.", price: 258.9, change: -1.63 },
  { symbol: "NVDA", name: "NVIDIA Corp.", price: 118.72, change: 3.05 },
  { symbol: "EURUSD", name: "Euro / USD", price: 1.0842, change: 0.05 },
  { symbol: "XAUUSD", name: "Gold Spot", price: 2398.6, change: 0.71 },
];

const DRAW_TOOLS = [
  { icon: Crosshair, label: "Crosshair" },
  { icon: TrendingUp, label: "Trend line" },
  { icon: Ruler, label: "Measure" },
  { icon: Type, label: "Text" },
  { icon: Trash2, label: "Remove" },
];

const TABS = ["Order book", "Positions", "Orders", "History"];

// --- mock candle generator (deterministic, purely visual) ---
function useMockCandles(count = 90, seedBase = 100) {
  return useMemo(() => {
    let last = seedBase;
    const candles = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      const open = last;
      const drift = (rand() - 0.48) * 4.5;
      const close = Math.max(5, open + drift);
      const high = Math.max(open, close) + rand() * 2.2;
      const low = Math.min(open, close) - rand() * 2.2;
      candles.push({ open, close, high, low });
      last = close;
    }
    return candles;
  }, [count, seedBase]);
}

function MiniChart({ candles, bull, bear, height = 40, width = 70 }) {
  const all = candles.flatMap((c) => [c.high, c.low]);
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;
  const points = candles.map((c, i) => {
    const x = (i / (candles.length - 1)) * width;
    const y = height - ((c.close - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = candles[candles.length - 1].close >= candles[0].close;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={up ? bull : bear}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function Candlesticks({ candles }) {
  const W = 900;
  const H = 460;
  const padY = 20;
  const all = candles.flatMap((c) => [c.high, c.low]);
  const max = Math.max(...all);
  const min = Math.min(...all);
  const range = max - min || 1;
  const slot = W / candles.length;
  const bodyW = Math.max(2, slot * 0.6);

  const y = (v) => H - padY - ((v - min) / range) * (H - padY * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
      {/* gridlines */}
      {Array.from({ length: 5 }).map((_, i) => {
        const gy = padY + (i * (H - padY * 2)) / 4;
        return (
          <line
            key={i}
            x1="0"
            x2={W}
            y1={gy}
            y2={gy}
            stroke={COLORS.border}
            strokeWidth="1"
          />
        );
      })}
      {candles.map((c, i) => {
        const cx = i * slot + slot / 2;
        const isUp = c.close >= c.open;
        const color = isUp ? COLORS.bull : COLORS.bear;
        const top = y(Math.max(c.open, c.close));
        const bottom = y(Math.min(c.open, c.close));
        return (
          <g key={i}>
            <line
              x1={cx}
              x2={cx}
              y1={y(c.high)}
              y2={y(c.low)}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={cx - bodyW / 2}
              y={top}
              width={bodyW}
              height={Math.max(1, bottom - top)}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

function VolumeBars({ candles }) {
  const W = 900;
  const H = 70;
  const slot = W / candles.length;
  const bodyW = Math.max(2, slot * 0.6);
  const vols = candles.map((c) => Math.abs(c.close - c.open) + 1.5);
  const max = Math.max(...vols);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none">
      {candles.map((c, i) => {
        const cx = i * slot + slot / 2;
        const isUp = c.close >= c.open;
        const h = (vols[i] / max) * H;
        return (
          <rect
            key={i}
            x={cx - bodyW / 2}
            y={H - h}
            width={bodyW}
            height={h}
            fill={isUp ? COLORS.bull : COLORS.bear}
            opacity="0.5"
          />
        );
      })}
    </svg>
  );
}

export default function TradingViewClone() {
  const [activeSymbolIdx, setActiveSymbolIdx] = useState(0);
  const [timeframe, setTimeframe] = useState("1H");
  const [tab, setTab] = useState(TABS[0]);
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("0.50");

  const candles = useMockCandles(90, 100);
  const activeSymbol = WATCHLIST[activeSymbolIdx];
  const lastCandle = candles[candles.length - 1];
  const isUp = lastCandle.close >= candles[0].close;

  return (
    <div
      style={{
        background: COLORS.bg0,
        color: COLORS.textPrimary,
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        fontSize: 13,
        overflow: "hidden",
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 12px",
          height: 48,
          borderBottom: `1px solid ${COLORS.border}`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            letterSpacing: 0.5,
            marginRight: 16,
            color: COLORS.textPrimary,
          }}
        >
          <span style={{ color: COLORS.accent }}>Trade</span>Board
        </div>

        <button style={pillBtnStyle(true)}>
          <span style={{ fontWeight: 600 }}>{activeSymbol.symbol}</span>
          <ChevronDown size={14} style={{ marginLeft: 4 }} />
        </button>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginLeft: 12 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 15,
              fontWeight: 600,
              color: isUp ? COLORS.bull : COLORS.bear,
            }}
          >
            {activeSymbol.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              color: activeSymbol.change >= 0 ? COLORS.bull : COLORS.bear,
              display: "flex",
              alignItems: "center",
            }}
          >
            {activeSymbol.change >= 0 ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {Math.abs(activeSymbol.change)}%
          </span>
        </div>

        <div style={{ display: "flex", gap: 2, marginLeft: 24 }}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={pillBtnStyle(timeframe === tf)}
            >
              {tf}
            </button>
          ))}
        </div>

        <button style={{ ...iconBtnStyle, marginLeft: 12 }} title="Indicators">
          <LayoutGrid size={16} />
          <span style={{ marginLeft: 6, fontSize: 12 }}>Indicators</span>
        </button>
        <button style={iconBtnStyle} title="Alert">
          <Bell size={16} />
        </button>

        <div style={{ flex: 1 }} />

        <button style={iconBtnStyle} title="Screenshot">
          <Camera size={16} />
        </button>
        <button style={iconBtnStyle} title="Fullscreen">
          <Maximize2 size={16} />
        </button>
        <button style={iconBtnStyle} title="Settings">
          <Settings size={16} />
        </button>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: COLORS.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            marginLeft: 8,
            cursor: "pointer",
          }}
        >
          JD
        </div>
      </div>

      {/* MAIN BODY */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* DRAWING TOOLBAR */}
        <div
          style={{
            width: 44,
            borderRight: `1px solid ${COLORS.border}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 8,
            gap: 4,
            flexShrink: 0,
          }}
        >
          {DRAW_TOOLS.map(({ icon: Icon, label }, i) => (
            <button key={label} title={label} style={sideIconBtnStyle(i === 0)}>
              <Icon size={16} />
            </button>
          ))}
          <div
            style={{
              width: 24,
              height: 1,
              background: COLORS.border,
              margin: "8px 0",
            }}
          />
          <button title="Undo" style={sideIconBtnStyle(false)}>
            <Undo2 size={16} />
          </button>
        </div>

        {/* CHART + BOTTOM PANEL */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ flex: 1, padding: "8px 8px 0 8px", minHeight: 0 }}>
            <div style={{ height: "78%" }}>
              <Candlesticks candles={candles} />
            </div>
            <div style={{ height: "18%", borderTop: `1px solid ${COLORS.border}` }}>
              <VolumeBars candles={candles} />
            </div>
          </div>

          {/* BOTTOM PANEL TABS */}
          <div
            style={{
              borderTop: `1px solid ${COLORS.border}`,
              flexShrink: 0,
              height: 180,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}` }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: "none",
                    border: "none",
                    color: tab === t ? COLORS.textPrimary : COLORS.textSecondary,
                    padding: "8px 14px",
                    fontSize: 12.5,
                    fontWeight: tab === t ? 600 : 400,
                    borderBottom: tab === t ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
              {tab === "Positions" ? (
                <PositionsTable />
              ) : (
                <div style={{ color: COLORS.textMuted, fontSize: 12.5 }}>
                  No {tab.toLowerCase()} yet — this panel is a placeholder for wiring up
                  real account data.
                </div>
              )}
            </div>
          </div>

          {/* STATUS BAR */}
          <div
            style={{
              height: 24,
              borderTop: `1px solid ${COLORS.border}`,
              display: "flex",
              alignItems: "center",
              padding: "0 10px",
              gap: 16,
              flexShrink: 0,
              fontSize: 11,
              color: COLORS.textMuted,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: COLORS.bull,
                  display: "inline-block",
                }}
              />
              Connected
            </span>
            <span>Server time 14:32:07 UTC</span>
            <span>{timeframe} · {activeSymbol.symbol}</span>
          </div>
        </div>

        {/* RIGHT SIDEBAR: WATCHLIST + ORDER PANEL */}
        <div
          style={{
            width: 300,
            borderLeft: `1px solid ${COLORS.border}`,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
          }}
        >
          {/* Watchlist */}
          <div style={{ borderBottom: `1px solid ${COLORS.border}`, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderBottom: `1px solid ${COLORS.border}`,
              }}
            >
              <Search size={14} color={COLORS.textMuted} />
              <input
                placeholder="Search symbol"
                style={{
                  background: "none",
                  border: "none",
                  outline: "none",
                  color: COLORS.textPrimary,
                  fontSize: 12.5,
                  width: "100%",
                }}
              />
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {WATCHLIST.map((row, i) => {
                const rowCandles = useMockCandles(24, row.price / 4 + i * 3);
                return (
                  <div
                    key={row.symbol}
                    onClick={() => setActiveSymbolIdx(i)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      cursor: "pointer",
                      background: i === activeSymbolIdx ? COLORS.bg2 : "transparent",
                      borderLeft:
                        i === activeSymbolIdx
                          ? `2px solid ${COLORS.accent}`
                          : "2px solid transparent",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Star
                        size={12}
                        color={COLORS.textMuted}
                        fill={i < 2 ? COLORS.textMuted : "none"}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>{row.symbol}</div>
                        <div style={{ fontSize: 10.5, color: COLORS.textMuted }}>
                          {row.name}
                        </div>
                      </div>
                    </div>
                    <MiniChart candles={rowCandles} bull={COLORS.bull} bear={COLORS.bear} />
                    <div style={{ textAlign: "right", minWidth: 62 }}>
                      <div
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 12,
                        }}
                      >
                        {row.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "'JetBrains Mono', monospace",
                          color: row.change >= 0 ? COLORS.bull : COLORS.bear,
                        }}
                      >
                        {row.change >= 0 ? "+" : ""}
                        {row.change}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order entry panel */}
          <div style={{ padding: 12, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button
                onClick={() => setSide("buy")}
                style={sideToggleStyle(side === "buy", COLORS.bull)}
              >
                Buy
              </button>
              <button
                onClick={() => setSide("sell")}
                style={sideToggleStyle(side === "sell", COLORS.bear)}
              >
                Sell
              </button>
            </div>

            <label style={labelStyle}>Quantity</label>
            <div style={qtyRowStyle}>
              <button
                style={qtyBtnStyle}
                onClick={() => setQty((q) => Math.max(0, +q - 0.1).toFixed(2))}
              >
                <Minus size={12} />
              </button>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={qtyInputStyle}
              />
              <button
                style={qtyBtnStyle}
                onClick={() => setQty((q) => (+q + 0.1).toFixed(2))}
              >
                <Plus size={12} />
              </button>
            </div>

            <label style={labelStyle}>Price</label>
            <input
              readOnly
              value={activeSymbol.price.toFixed(2)}
              style={priceInputStyle}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                color: COLORS.textMuted,
                margin: "10px 0",
              }}
            >
              <span>Est. cost</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {(activeSymbol.price * (+qty || 0)).toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <button
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: 4,
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                color: "#fff",
                background: side === "buy" ? COLORS.bull : COLORS.bear,
              }}
            >
              {side === "buy" ? "Buy" : "Sell"} {activeSymbol.symbol}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionsTable() {
  const rows = [
    { symbol: "BTCUSD", side: "Long", size: 0.5, entry: 65210.0, pnl: 1111.25 },
    { symbol: "AAPL", side: "Short", size: 20, entry: 234.5, pnl: -67.2 },
  ];
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ color: COLORS.textMuted, textAlign: "left" }}>
          <th style={thStyle}>Symbol</th>
          <th style={thStyle}>Side</th>
          <th style={thStyle}>Size</th>
          <th style={thStyle}>Entry</th>
          <th style={thStyle}>P&L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.symbol} style={{ borderTop: `1px solid ${COLORS.border}` }}>
            <td style={tdStyle}>{r.symbol}</td>
            <td style={{ ...tdStyle, color: r.side === "Long" ? COLORS.bull : COLORS.bear }}>
              {r.side}
            </td>
            <td style={tdStyle}>{r.size}</td>
            <td style={tdStyle}>{r.entry.toFixed(2)}</td>
            <td style={{ ...tdStyle, color: r.pnl >= 0 ? COLORS.bull : COLORS.bear }}>
              {r.pnl >= 0 ? "+" : ""}
              {r.pnl.toFixed(2)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- style helpers ---
const pillBtnStyle = (active) => ({
  background: active ? COLORS.bg2 : "transparent",
  border: `1px solid ${active ? COLORS.borderStrong : "transparent"}`,
  color: active ? COLORS.textPrimary : COLORS.textSecondary,
  borderRadius: 4,
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
});

const iconBtnStyle = {
  background: "none",
  border: "none",
  color: COLORS.textSecondary,
  padding: "6px 8px",
  borderRadius: 4,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
};

const sideIconBtnStyle = (active) => ({
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: active ? COLORS.bg2 : "transparent",
  color: active ? COLORS.accent : COLORS.textSecondary,
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
});

const sideToggleStyle = (active, color) => ({
  flex: 1,
  padding: "8px 0",
  borderRadius: 4,
  border: `1px solid ${active ? color : COLORS.border}`,
  background: active ? `${color}22` : "transparent",
  color: active ? color : COLORS.textSecondary,
  fontWeight: 600,
  fontSize: 12.5,
  cursor: "pointer",
});

const labelStyle = {
  display: "block",
  fontSize: 10.5,
  color: COLORS.textMuted,
  margin: "8px 0 4px",
};

const qtyRowStyle = { display: "flex", alignItems: "center", gap: 4 };
const qtyBtnStyle = {
  width: 26,
  height: 26,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.bg2,
  color: COLORS.textSecondary,
  borderRadius: 4,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const qtyInputStyle = {
  flex: 1,
  textAlign: "center",
  background: COLORS.bg2,
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textPrimary,
  borderRadius: 4,
  padding: "5px 0",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5,
};
const priceInputStyle = {
  width: "100%",
  background: COLORS.bg2,
  border: `1px solid ${COLORS.border}`,
  color: COLORS.textPrimary,
  borderRadius: 4,
  padding: "7px 8px",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5,
};

const thStyle = { padding: "4px 8px", fontWeight: 500 };
const tdStyle = { padding: "6px 8px" };
