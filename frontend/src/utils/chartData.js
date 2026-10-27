export const mapBinanceCandles = (rows) => {
  if (!Array.isArray(rows)) return [];
  const byTime = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const timestamp = Number(row[0]);
    const time = Math.floor(timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if (!Number.isSafeInteger(time) || time <= 0 || ![open, high, low, close, volume].every(Number.isFinite)) continue;
    if (Math.min(open, high, low, close) <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) continue;
    byTime.set(time, { time, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((left, right) => left.time - right.time);
};

export const simpleMovingAverage = (candles, period) => {
  if (!Number.isInteger(period) || period < 1) return [];
  const values = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;
    if (index >= period) sum -= candles[index - period].close;
    if (index >= period - 1) values.push({ time: candles[index].time, value: sum / period });
  }
  return values;
};

export const exponentialMovingAverage = (candles, period) => {
  if (!Number.isInteger(period) || period < 1 || candles.length < period) return [];
  const values = [];
  let seed = 0;
  for (let index = 0; index < period; index += 1) seed += candles[index].close;
  let previous = seed / period;
  values.push({ time: candles[period - 1].time, value: previous });
  const smoothing = 2 / (period + 1);
  for (let index = period; index < candles.length; index += 1) {
    previous = candles[index].close * smoothing + previous * (1 - smoothing);
    values.push({ time: candles[index].time, value: previous });
  }
  return values;
};

export const getChartIndicators = (candles) => ({
  sma20: simpleMovingAverage(candles, 20),
  sma50: simpleMovingAverage(candles, 50),
  ema20: exponentialMovingAverage(candles, 20),
  volume: candles.map(({ time, volume, close, open }) => ({ time, value: volume, color: close >= open ? 'rgba(8,153,129,.36)' : 'rgba(242,54,69,.36)' }))
});
