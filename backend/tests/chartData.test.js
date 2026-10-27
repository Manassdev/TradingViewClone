import test from 'node:test';
import assert from 'node:assert/strict';
import { exponentialMovingAverage, getChartIndicators, mapBinanceCandles, simpleMovingAverage } from '../../frontend/src/utils/chartData.js';

test('maps valid Binance candles into sorted, unique Lightweight Charts time points', () => {
  const rows = [
    [1_710_000_120_000, '11', '13', '10', '12', '5'],
    [1_710_000_000_000, '9', '12', '8', '11', '4'],
    [1_710_000_120_000, '11', '14', '10', '13', '6'],
    ['bad', '1', '1', '1', '1', '1'],
    [1_710_000_180_000, '12', '10', '11', '12', '3'],
    [1_710_000_240_000, '0', '1', '0', '1', '3']
  ];
  const result = mapBinanceCandles(rows);
  assert.deepEqual(result.map(({ time, close, volume }) => ({ time, close, volume })), [
    { time: 1_710_000_000, close: 11, volume: 4 },
    { time: 1_710_000_120, close: 13, volume: 6 }
  ]);
});

test('calculates SMA, EMA, and volume values from the selected real candle series', () => {
  const candles = Array.from({ length: 55 }, (_, index) => ({
    time: index + 1, open: index + 1, high: index + 2, low: index + 0.5,
    close: index + 1, volume: (index + 1) * 10
  }));
  assert.deepEqual(simpleMovingAverage(candles.slice(0, 3), 3), [{ time: 3, value: 2 }]);
  assert.deepEqual(exponentialMovingAverage(candles.slice(0, 3), 3), [{ time: 3, value: 2 }]);
  const series = getChartIndicators(candles);
  assert.equal(series.sma20.length, 36);
  assert.equal(series.sma50.length, 6);
  assert.equal(series.ema20.length, 36);
  assert.equal(series.sma20[0].time, 20);
  assert.equal(series.sma50[0].value, 25.5);
  assert.equal(series.volume.length, candles.length);
  assert.equal(series.volume[0].value, 10);
  assert.equal(series.volume.at(-1).value, 550);
});
