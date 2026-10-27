const SHORT_SMA_PERIOD = 9;
const LONG_SMA_PERIOD = 21;
const BREAKOUT_LOOKBACK = 20;
const MOMENTUM_THRESHOLD_PERCENT = 5;

const numberAt = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;

const formatPrice = (value) => Number(value).toLocaleString('en-US', {
  maximumFractionDigits: 8
});

const toIsoTimestamp = (value) => {
  const timestamp = numberAt(value);
  if (timestamp === null) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeCompletedCandles = (rows, now = Date.now()) => {
  if (!Array.isArray(rows)) return [];

  const byOpenTime = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const openTime = numberAt(row[0]);
    const open = numberAt(row[1]);
    const high = numberAt(row[2]);
    const low = numberAt(row[3]);
    const close = numberAt(row[4]);
    const volume = numberAt(row[5]);
    const closeTime = numberAt(row[6]);
    if ([openTime, open, high, low, close, volume, closeTime].some((value) => value === null)) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || closeTime >= now) continue;
    if (high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    byOpenTime.set(openTime, { openTime, open, high, low, close, volume, closeTime });
  }

  return [...byOpenTime.values()].sort((a, b) => a.openTime - b.openTime);
};

const createIdea = ({ symbol, title, signal, price, change24h, description, indicator, kind, generatedAt, priceTimestamp, candleTimestamp }) => ({
  id: `binance-${symbol}-${kind}`,
  symbol,
  title,
  signal,
  kind,
  price,
  change24h,
  description,
  indicator,
  generatedAt,
  priceTimestamp,
  candleTimestamp,
  interval: '1h',
  source: 'Binance'
});

/**
 * Generate deterministic ideas from one Binance 24-hour ticker and its hourly candles.
 * Indicator rules use completed candles only; ticker momentum uses Binance's 24-hour value.
 */
export const generateIdeasForSymbol = ({ symbol, ticker, candleRows, now = Date.now(), generatedAt = new Date(now).toISOString() }) => {
  const ideas = [];
  const price = numberAt(ticker?.lastPrice);
  const change24h = numberAt(ticker?.priceChangePercent);
  const priceTimestamp = toIsoTimestamp(ticker?.closeTime);
  if (!symbol || price === null || price <= 0 || change24h === null || !priceTimestamp) {
    return { ideas, status: 'invalid-market-data', completedCandles: 0 };
  }

  const candles = normalizeCompletedCandles(candleRows, now);
  const latest = candles.at(-1);
  const candleTimestamp = latest ? toIsoTimestamp(latest.closeTime) : null;
  const shared = { symbol, price, change24h, generatedAt, priceTimestamp, candleTimestamp };

  if (candles.length >= LONG_SMA_PERIOD + 1) {
    const closes = candles.map((candle) => candle.close);
    const previousShort = average(closes.slice(-(SHORT_SMA_PERIOD + 1), -1));
    const currentShort = average(closes.slice(-SHORT_SMA_PERIOD));
    const previousLong = average(closes.slice(-(LONG_SMA_PERIOD + 1), -1));
    const currentLong = average(closes.slice(-LONG_SMA_PERIOD));

    if (previousShort <= previousLong && currentShort > currentLong) {
      ideas.push(createIdea({
        ...shared,
        kind: 'sma-bullish-crossover',
        signal: 'bullish',
        title: `${symbol} Potential Bullish Crossover`,
        indicator: `${SHORT_SMA_PERIOD}/${LONG_SMA_PERIOD} SMA crossover`,
        description: `On completed 1-hour candles, the ${SHORT_SMA_PERIOD}-period SMA crossed above the ${LONG_SMA_PERIOD}-period SMA. The previous short average was at or below the long average; the latest short average is above it.`
      }));
    } else if (previousShort >= previousLong && currentShort < currentLong) {
      ideas.push(createIdea({
        ...shared,
        kind: 'sma-bearish-crossover',
        signal: 'bearish',
        title: `${symbol} Potential Bearish Crossover`,
        indicator: `${SHORT_SMA_PERIOD}/${LONG_SMA_PERIOD} SMA crossover`,
        description: `On completed 1-hour candles, the ${SHORT_SMA_PERIOD}-period SMA crossed below the ${LONG_SMA_PERIOD}-period SMA. The previous short average was at or above the long average; the latest short average is below it.`
      }));
    }
  }

  if (candles.length >= BREAKOUT_LOOKBACK + 1) {
    const priorCandles = candles.slice(-(BREAKOUT_LOOKBACK + 1), -1);
    const resistance = Math.max(...priorCandles.map((candle) => candle.high));
    const support = Math.min(...priorCandles.map((candle) => candle.low));

    if (latest.close > resistance) {
      ideas.push(createIdea({
        ...shared,
        kind: 'resistance-breakout',
        signal: 'bullish',
        title: `${symbol} Potential Resistance Breakout`,
        indicator: `${BREAKOUT_LOOKBACK}-candle resistance breakout`,
        description: `The latest completed 1-hour close (${formatPrice(latest.close)}) is above the highest high (${formatPrice(resistance)}) of the previous ${BREAKOUT_LOOKBACK} completed hourly candles.`
      }));
    } else if (latest.close < support) {
      ideas.push(createIdea({
        ...shared,
        kind: 'support-breakdown',
        signal: 'bearish',
        title: `${symbol} Potential Support Breakdown`,
        indicator: `${BREAKOUT_LOOKBACK}-candle support breakdown`,
        description: `The latest completed 1-hour close (${formatPrice(latest.close)}) is below the lowest low (${formatPrice(support)}) of the previous ${BREAKOUT_LOOKBACK} completed hourly candles.`
      }));
    }
  }

  if (change24h >= MOMENTUM_THRESHOLD_PERCENT) {
    ideas.push(createIdea({
      ...shared,
      kind: 'positive-momentum',
      signal: 'bullish',
      title: `${symbol} Significant Positive 24-Hour Momentum`,
      indicator: `${MOMENTUM_THRESHOLD_PERCENT}% 24-hour momentum threshold`,
      description: `Binance reports a 24-hour price change of +${change24h.toFixed(2)}%, meeting the configured positive-momentum threshold of +${MOMENTUM_THRESHOLD_PERCENT}%.`
    }));
  } else if (change24h <= -MOMENTUM_THRESHOLD_PERCENT) {
    ideas.push(createIdea({
      ...shared,
      kind: 'negative-momentum',
      signal: 'bearish',
      title: `${symbol} Significant Negative 24-Hour Momentum`,
      indicator: `${MOMENTUM_THRESHOLD_PERCENT}% 24-hour momentum threshold`,
      description: `Binance reports a 24-hour price change of ${change24h.toFixed(2)}%, meeting the configured negative-momentum threshold of -${MOMENTUM_THRESHOLD_PERCENT}%.`
    }));
  }

  return {
    ideas,
    status: candles.length >= LONG_SMA_PERIOD + 1
      ? 'analyzed'
      : (candles.length >= BREAKOUT_LOOKBACK + 1 ? 'limited-history' : 'insufficient-candles'),
    completedCandles: candles.length
  };
};

export const IDEA_RULES = Object.freeze({
  interval: '1h',
  shortSmaPeriod: SHORT_SMA_PERIOD,
  longSmaPeriod: LONG_SMA_PERIOD,
  minimumSmaCandles: LONG_SMA_PERIOD + 1,
  breakoutLookback: BREAKOUT_LOOKBACK,
  minimumBreakoutCandles: BREAKOUT_LOOKBACK + 1,
  momentumThresholdPercent: MOMENTUM_THRESHOLD_PERCENT
});
