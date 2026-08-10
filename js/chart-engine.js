/* Lightweight Charts initialization, technical indicators formulas, drawings layer & WS feed */

window.ChartEngine = {
  chart: null,
  activeSeriesType: 'candlestick',
  activeSeries: null,
  candleSeries: null,
  lineSeries: null,
  areaSeries: null,
  barSeries: null,
  volumeSeries: null,
  
  // Indicators series
  maSeries: null,
  emaSeries: null,
  vwapSeries: null,
  bbBasisSeries: null,
  bbUpperSeries: null,
  bbLowerSeries: null,
  
  // Indicator config states
  indicatorConfig: {
    ma: { enabled: false, period: 9, color: '#2962FF', width: 2 },
    ema: { enabled: false, period: 26, color: '#FF6D00', width: 2 },
    vwap: { enabled: false, color: '#E040FB', width: 1.5 },
    bb: { enabled: false, period: 20, multiplier: 2, color: '#26A69A' },
    volume: { enabled: true },
    rsi: { enabled: false, period: 14, color: '#AB47BC' },
    macd: { enabled: false },
    stoch: { enabled: false }
  },

  // Oscillator stacked sub-charts instances
  rsiChart: null,
  rsiSeries: null,
  macdChart: null,
  macdLineSeries: null,
  macdSignalSeries: null,
  macdHistSeries: null,
  stochChart: null,
  stochKSeries: null,
  stochDSeries: null,

  // Historical data array
  candleData: [],
  
  // Active Binance websocket
  ws: null,
  
  // SVG Drawings variables
  activeTool: 'select',
  drawings: [],
  isDrawing: false,
  currentDrawing: null,
  tempDrawingPoints: [],

  init() {
    this.createMainChart();
    this.setupDrawingCanvas();
    this.loadData(AppState.activeSymbol, AppState.activeTimeframe);
  },

  createMainChart() {
    const root = document.getElementById('chart-container-root');
    if (!root) return;
    root.innerHTML = ''; // clear

    const chartOptions = {
      layout: {
        background: { color: AppState.theme === 'dark' ? '#131722' : '#ffffff' },
        textColor: AppState.theme === 'dark' ? '#d1d4dc' : '#131722',
        fontSize: 11,
        fontFamily: "'Outfit', sans-serif"
      },
      grid: {
        vertLines: { color: AppState.theme === 'dark' ? 'rgba(42, 46, 57, 0.4)' : 'rgba(0, 0, 0, 0.05)' },
        horzLines: { color: AppState.theme === 'dark' ? 'rgba(42, 46, 57, 0.4)' : 'rgba(0, 0, 0, 0.05)' }
      },
      crosshair: {
        mode: 1 // Normal mode
      },
      rightPriceScale: {
        borderColor: AppState.theme === 'dark' ? 'rgba(197, 203, 206, 0.1)' : 'rgba(0, 0, 0, 0.08)'
      },
      timeScale: {
        borderColor: AppState.theme === 'dark' ? 'rgba(197, 203, 206, 0.1)' : 'rgba(0, 0, 0, 0.08)',
        timeVisible: true,
        secondsVisible: false
      }
    };

    this.chart = LightweightCharts.createChart(root, chartOptions);

    // Create price series types
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: '#089981', downColor: '#f23645',
      borderVisible: false, wickUpColor: '#089981', wickDownColor: '#f23645'
    });
    this.lineSeries = this.chart.addLineSeries({ color: '#2962FF', lineWidth: 2, visible: false });
    this.areaSeries = this.chart.addAreaSeries({
      topColor: 'rgba(41, 98, 255, 0.3)', bottomColor: 'rgba(41, 98, 255, 0.01)',
      lineColor: '#2962FF', lineWidth: 2, visible: false
    });
    this.barSeries = this.chart.addBarSeries({
      upColor: '#089981', downColor: '#f23645', visible: false
    });

    this.activeSeries = this.candleSeries;

    // Create volume overlay series
    this.volumeSeries = this.chart.addHistogramSeries({
      color: 'rgba(38, 166, 154, 0.25)',
      priceFormat: { type: 'volume' },
      priceScaleId: '' // overlay
    });
    this.volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    // Create overlays indicators line series
    this.maSeries = this.chart.addLineSeries({ color: this.indicatorConfig.ma.color, lineWidth: this.indicatorConfig.ma.width, visible: false });
    this.emaSeries = this.chart.addLineSeries({ color: this.indicatorConfig.ema.color, lineWidth: this.indicatorConfig.ema.width, visible: false });
    this.vwapSeries = this.chart.addLineSeries({ color: this.indicatorConfig.vwap.color, lineWidth: this.indicatorConfig.vwap.width, visible: false });
    
    // Bollinger bands series
    this.bbBasisSeries = this.chart.addLineSeries({ color: '#757575', lineWidth: 1, lineStyle: 2, visible: false });
    this.bbUpperSeries = this.chart.addLineSeries({ color: this.indicatorConfig.bb.color, lineWidth: 1, visible: false });
    this.bbLowerSeries = this.chart.addLineSeries({ color: this.indicatorConfig.bb.color, lineWidth: 1, visible: false });

    // Handle viewport resize
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      this.chart.resize(width, height);
      this.drawAllSvgShapes();
    });
    resizeObserver.observe(root);

    // Sync scroll and zoom events for redraws
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this.drawAllSvgShapes();
    });

    // Sync sub-charts scrollbar ranges
    this.chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) {
        [this.rsiChart, this.macdChart, this.stochChart].forEach(sub => {
          if (sub) sub.timeScale().setVisibleRange(range);
        });
      }
    });
  },

  setTheme(theme) {
    const isDark = theme === 'dark';
    const background = isDark ? '#131722' : '#ffffff';
    const textColor = isDark ? '#d1d4dc' : '#131722';
    const gridColor = isDark ? 'rgba(42, 46, 57, 0.4)' : 'rgba(0, 0, 0, 0.05)';
    const borderColor = isDark ? 'rgba(197, 203, 206, 0.1)' : 'rgba(0, 0, 0, 0.08)';

    const applyTheme = (chartObj) => {
      if (!chartObj) return;
      chartObj.applyOptions({
        layout: { background: { color: background }, textColor: textColor },
        grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
        rightPriceScale: { borderColor: borderColor },
        timeScale: { borderColor: borderColor }
      });
    };

    applyTheme(this.chart);
    applyTheme(this.rsiChart);
    applyTheme(this.macdChart);
    applyTheme(this.stochChart);
    
    this.drawAllSvgShapes();
  },

  async loadData(symbol, timeframe) {
    if (this.ws) {
      this.ws.close();
    }
    
    // Clear series
    this.candleSeries.setData([]);
    this.lineSeries.setData([]);
    this.areaSeries.setData([]);
    this.barSeries.setData([]);
    this.volumeSeries.setData([]);
    this.maSeries.setData([]);
    this.emaSeries.setData([]);
    this.vwapSeries.setData([]);
    this.bbBasisSeries.setData([]);
    this.bbUpperSeries.setData([]);
    this.bbLowerSeries.setData([]);
    
    if (this.rsiSeries) this.rsiSeries.setData([]);
    if (this.macdLineSeries) {
      this.macdLineSeries.setData([]);
      this.macdSignalSeries.setData([]);
      this.macdHistSeries.setData([]);
    }
    if (this.stochKSeries) {
      this.stochKSeries.setData([]);
      this.stochDSeries.setData([]);
    }

    try {
      // Binance API limit 300 klines
      const res = await fetch(`${AppConfig.apiBase}/api/v3/klines?symbol=${symbol}&interval=${timeframe}&limit=300`);
      if (!res.ok) throw new Error('Failed to fetch historical rates');
      const klines = await res.json();

      this.candleData = klines.map(k => {
        const time = k[0] / 1000;
        const open = parseFloat(k[1]);
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const close = parseFloat(k[4]);
        const volume = parseFloat(k[5]);
        return { time, open, high, low, close, volume };
      });

      this.updateSeriesData();
      this.chart.timeScale().fitContent();

      // Start WebSockets streaming
      this.connectWebSocket(symbol, timeframe);
      
      // Update details page metrics immediately using last candle close
      const lastCandle = this.candleData[this.candleData.length - 1];
      if (lastCandle && window.AppModule && window.AppModule.updateDetailsPanel) {
        window.AppModule.updateDetailsPanel(symbol, lastCandle.close);
      }

    } catch (err) {
      console.error('Binance API error:', err);
      if (window.AppModule && window.AppModule.showToast) {
        window.AppModule.showToast('Network error loading historical stock rates', 'error');
      }
    }
  },

  updateSeriesData() {
    const mappedPrices = this.candleData.map(d => ({
      time: d.time, open: d.open, high: d.high, low: d.low, close: d.close
    }));
    const mappedLine = this.candleData.map(d => ({ time: d.time, value: d.close }));
    const mappedVol = this.candleData.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
    }));

    this.candleSeries.setData(mappedPrices);
    this.lineSeries.setData(mappedLine);
    this.areaSeries.setData(mappedLine);
    this.barSeries.setData(mappedPrices);
    this.volumeSeries.setData(mappedVol);

    this.calculateIndicators();
    this.drawAllSvgShapes();
  },

  connectWebSocket(symbol, timeframe) {
    const wsSymbol = symbol.toLowerCase();
    this.ws = new WebSocket(`${AppConfig.wsBase}/ws/${wsSymbol}@kline_${timeframe}`);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg && msg.k) {
        const k = msg.k;
        const time = k.t / 1000;
        const open = parseFloat(k.o);
        const high = parseFloat(k.h);
        const low = parseFloat(k.l);
        const close = parseFloat(k.c);
        const volume = parseFloat(k.v);

        const liveTick = { time, open, high, low, close, volume };

        // Real-time price actions
        if (window.AppModule && window.AppModule.handlePriceTick) {
          window.AppModule.handlePriceTick(symbol, close);
        }

        // Update active chart series
        const lastCandle = this.candleData[this.candleData.length - 1];
        if (lastCandle && lastCandle.time === time) {
          this.candleData[this.candleData.length - 1] = liveTick;
        } else {
          this.candleData.push(liveTick);
          if (this.candleData.length > 500) this.candleData.shift();
        }

        // Live draw updates
        const mappedPrices = { time, open, high, low, close };
        const mappedLine = { time, value: close };
        const mappedVol = {
          time,
          value: volume,
          color: close >= open ? 'rgba(8, 153, 129, 0.25)' : 'rgba(242, 54, 69, 0.25)'
        };

        this.candleSeries.update(mappedPrices);
        this.lineSeries.update(mappedLine);
        this.areaSeries.update(mappedLine);
        this.barSeries.update(mappedPrices);
        this.volumeSeries.update(mappedVol);

        this.calculateIndicators();
      }
    };
  },

  changeSeriesType(type) {
    this.activeSeriesType = type;
    this.candleSeries.applyOptions({ visible: type === 'candlestick' });
    this.lineSeries.applyOptions({ visible: type === 'line' });
    this.areaSeries.applyOptions({ visible: type === 'area' });
    this.barSeries.applyOptions({ visible: type === 'bar' });

    if (type === 'candlestick') this.activeSeries = this.candleSeries;
    if (type === 'line') this.activeSeries = this.lineSeries;
    if (type === 'area') this.activeSeries = this.areaSeries;
    if (type === 'bar') this.activeSeries = this.barSeries;
    
    this.drawAllSvgShapes();
  },

  toggleIndicator(name) {
    const config = this.indicatorConfig[name];
    if (name === 'volume') {
      config.enabled = document.getElementById('ind-volume').checked;
      this.volumeSeries.applyOptions({ visible: config.enabled });
      return;
    }

    const check = document.getElementById(`ind-${name}`);
    config.enabled = check ? check.checked : false;

    // Direct overlays
    if (name === 'ma') this.maSeries.applyOptions({ visible: config.enabled });
    if (name === 'ema') this.emaSeries.applyOptions({ visible: config.enabled });
    if (name === 'vwap') this.vwapSeries.applyOptions({ visible: config.enabled });
    
    if (name === 'bb') {
      this.bbBasisSeries.applyOptions({ visible: config.enabled });
      this.bbUpperSeries.applyOptions({ visible: config.enabled });
      this.bbLowerSeries.applyOptions({ visible: config.enabled });
    }

    // Oscillators pane rendering
    if (name === 'rsi') {
      const box = document.getElementById('rsi-container-root');
      box.style.display = config.enabled ? 'block' : 'none';
      if (config.enabled && !this.rsiChart) this.createRsiChart();
      this.syncOscillatorRange();
    }
    if (name === 'macd') {
      const box = document.getElementById('macd-container-root');
      box.style.display = config.enabled ? 'block' : 'none';
      if (config.enabled && !this.macdChart) this.createMacdChart();
      this.syncOscillatorRange();
    }
    if (name === 'stoch') {
      const box = document.getElementById('stoch-container-root');
      box.style.display = config.enabled ? 'block' : 'none';
      if (config.enabled && !this.stochChart) this.createStochChart();
      this.syncOscillatorRange();
    }

    this.calculateIndicators();
    // Trigger window resize to align canvas sizes
    window.dispatchEvent(new Event('resize'));
  },

  updateIndicatorConfig(name, settings) {
    Object.assign(this.indicatorConfig[name], settings);
    
    // Update lines styling
    if (name === 'ma') {
      this.maSeries.applyOptions({ color: this.indicatorConfig.ma.color, lineWidth: this.indicatorConfig.ma.width });
    }
    if (name === 'ema') {
      this.emaSeries.applyOptions({ color: this.indicatorConfig.ema.color, lineWidth: this.indicatorConfig.ema.width });
    }
    if (name === 'bb') {
      this.bbUpperSeries.applyOptions({ color: this.indicatorConfig.bb.color });
      this.bbLowerSeries.applyOptions({ color: this.indicatorConfig.bb.color });
    }
    if (name === 'rsi' && this.rsiSeries) {
      this.rsiSeries.applyOptions({ color: this.indicatorConfig.rsi.color });
    }

    this.calculateIndicators();
  },

  calculateIndicators() {
    const data = this.candleData;
    if (data.length === 0) return;

    // 1. SMA (Simple Moving Average)
    if (this.indicatorConfig.ma.enabled) {
      const period = this.indicatorConfig.ma.period;
      const maVals = [];
      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) continue;
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j].close;
        }
        maVals.push({ time: data[i].time, value: sum / period });
      }
      this.maSeries.setData(maVals);
    }

    // 2. EMA (Exponential Moving Average)
    if (this.indicatorConfig.ema.enabled) {
      const period = this.indicatorConfig.ema.period;
      const emaVals = [];
      if (data.length >= period) {
        let k = 2 / (period + 1);
        let ema = data[0].close;
        for (let i = 0; i < data.length; i++) {
          ema = data[i].close * k + ema * (1 - k);
          if (i >= period - 1) {
            emaVals.push({ time: data[i].time, value: ema });
          }
        }
      }
      this.emaSeries.setData(emaVals);
    }

    // 3. VWAP (Volume Weighted Average Price)
    if (this.indicatorConfig.vwap.enabled) {
      const vwapVals = [];
      let cumPV = 0;
      let cumV = 0;
      for (let i = 0; i < data.length; i++) {
        const typPrice = (data[i].high + data[i].low + data[i].close) / 3;
        cumPV += typPrice * data[i].volume;
        cumV += data[i].volume;
        vwapVals.push({ time: data[i].time, value: cumV > 0 ? cumPV / cumV : typPrice });
      }
      this.vwapSeries.setData(vwapVals);
    }

    // 4. Bollinger Bands
    if (this.indicatorConfig.bb.enabled) {
      const period = this.indicatorConfig.bb.period;
      const mult = this.indicatorConfig.bb.multiplier;
      const basisVals = [];
      const upperVals = [];
      const lowerVals = [];

      for (let i = 0; i < data.length; i++) {
        if (i < period - 1) continue;
        
        let sum = 0;
        for (let j = 0; j < period; j++) sum += data[i - j].close;
        const mean = sum / period;
        
        let variance = 0;
        for (let j = 0; j < period; j++) variance += Math.pow(data[i - j].close - mean, 2);
        const stdDev = Math.sqrt(variance / period);

        basisVals.push({ time: data[i].time, value: mean });
        upperVals.push({ time: data[i].time, value: mean + mult * stdDev });
        lowerVals.push({ time: data[i].time, value: mean - mult * stdDev });
      }
      this.bbBasisSeries.setData(basisVals);
      this.bbUpperSeries.setData(upperVals);
      this.bbLowerSeries.setData(lowerVals);
    }

    // 5. RSI (Relative Strength Index)
    if (this.indicatorConfig.rsi.enabled && this.rsiSeries) {
      const period = this.indicatorConfig.rsi.period;
      const rsiVals = [];
      let gains = 0;
      let losses = 0;

      // First change calculation
      for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff > 0) gains += diff;
        else losses -= diff;
      }

      let avgGain = gains / period;
      let avgLoss = losses / period;
      rsiVals.push({ time: data[period].time, value: avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss))) });

      for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].close - data[i - 1].close;
        avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
        avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
        
        const rs = avgLoss === 0 ? 9999 : avgGain / avgLoss;
        rsiVals.push({ time: data[i].time, value: 100 - (100 / (1 + rs)) });
      }
      this.rsiSeries.setData(rsiVals);
    }

    // 6. MACD (Moving Average Convergence Divergence)
    if (this.indicatorConfig.macd.enabled && this.macdLineSeries) {
      const macdVals = [];
      const signalVals = [];
      const fontVals = [];
      const histVals = [];
      
      const getEMA = (values, p) => {
        const emaArr = [];
        let k = 2 / (p + 1);
        let ema = values[0];
        emaArr.push(ema);
        for (let i = 1; i < values.length; i++) {
          ema = values[i] * k + ema * (1 - k);
          emaArr.push(ema);
        }
        return emaArr;
      };

      const closes = data.map(d => d.close);
      const ema12 = getEMA(closes, 12);
      const ema26 = getEMA(closes, 26);
      
      const macdLine = [];
      for (let i = 0; i < data.length; i++) {
        macdLine.push(ema12[i] - ema26[i]);
      }

      const signal = getEMA(macdLine, 9);

      for (let i = 0; i < data.length; i++) {
        macdVals.push({ time: data[i].time, value: macdLine[i] });
        signalVals.push({ time: data[i].time, value: signal[i] });
        
        const hist = macdLine[i] - signal[i];
        histVals.push({
          time: data[i].time,
          value: hist,
          color: hist >= 0 ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)'
        });
      }

      this.macdLineSeries.setData(macdVals);
      this.macdSignalSeries.setData(signalVals);
      this.macdHistSeries.setData(histVals);
    }

    // 7. Stochastic Oscillator
    if (this.indicatorConfig.stoch.enabled && this.stochKSeries) {
      const periodK = 14;
      const periodD = 3;
      const slowing = 3;
      
      const kVals = [];
      const dVals = [];

      const rawK = [];
      for (let i = 0; i < data.length; i++) {
        if (i < periodK - 1) {
          rawK.push(50);
          continue;
        }
        
        let lowest = Infinity;
        let highest = -Infinity;
        for (let j = 0; j < periodK; j++) {
          if (data[i - j].low < lowest) lowest = data[i - j].low;
          if (data[i - j].high > highest) highest = data[i - j].high;
        }

        const denom = highest - lowest;
        const k = denom === 0 ? 50 : ((data[i].close - lowest) / denom) * 100;
        rawK.push(k);
      }

      // Slowing K
      const slowedK = [];
      for (let i = 0; i < rawK.length; i++) {
        if (i < slowing - 1) {
          slowedK.push(50);
          continue;
        }
        let sum = 0;
        for (let j = 0; j < slowing; j++) sum += rawK[i - j];
        slowedK.push(sum / slowing);
      }

      // %D Moving Average of %K
      for (let i = 0; i < data.length; i++) {
        kVals.push({ time: data[i].time, value: slowedK[i] });
        
        if (i < periodD - 1) {
          dVals.push({ time: data[i].time, value: 50 });
          continue;
        }
        let sum = 0;
        for (let j = 0; j < periodD; j++) sum += slowedK[i - j];
        dVals.push({ time: data[i].time, value: sum / periodD });
      }

      this.stochKSeries.setData(kVals);
      this.stochDSeries.setData(dVals);
    }
  },

  /* OSCILLATOR SUB-CHARTS CREATION */
  createRsiChart() {
    const root = document.getElementById('rsi-container-root');
    if (!root) return;
    this.rsiChart = LightweightCharts.createChart(root, {
      layout: {
        background: { color: AppState.theme === 'dark' ? '#131722' : '#ffffff' },
        textColor: AppState.theme === 'dark' ? '#d1d4dc' : '#131722',
        fontSize: 10,
        fontFamily: "'Outfit', sans-serif"
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
      timeScale: { visible: false } // Hide timescale, main chart governs it
    });
    this.rsiSeries = this.rsiChart.addLineSeries({ color: this.indicatorConfig.rsi.color, lineWidth: 1.5 });
    
    // Add 30/70 thresholds
    this.rsiChart.addLineSeries({ color: 'rgba(197, 203, 206, 0.2)', lineWidth: 1, lineStyle: 2 });
    this.rsiChart.addLineSeries({ color: 'rgba(197, 203, 206, 0.2)', lineWidth: 1, lineStyle: 2 });
    
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      this.syncOscillatorRange();
    });
  },

  createMacdChart() {
    const root = document.getElementById('macd-container-root');
    if (!root) return;
    this.macdChart = LightweightCharts.createChart(root, {
      layout: {
        background: { color: AppState.theme === 'dark' ? '#131722' : '#ffffff' },
        textColor: AppState.theme === 'dark' ? '#d1d4dc' : '#131722',
        fontSize: 10,
        fontFamily: "'Outfit', sans-serif"
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
      timeScale: { visible: false }
    });
    this.macdLineSeries = this.macdChart.addLineSeries({ color: '#2962FF', lineWidth: 1.5 });
    this.macdSignalSeries = this.macdChart.addLineSeries({ color: '#FF6D00', lineWidth: 1.5 });
    this.macdHistSeries = this.macdChart.addHistogramSeries({ priceScaleId: '' });
  },

  createStochChart() {
    const root = document.getElementById('stoch-container-root');
    if (!root) return;
    this.stochChart = LightweightCharts.createChart(root, {
      layout: {
        background: { color: AppState.theme === 'dark' ? '#131722' : '#ffffff' },
        textColor: AppState.theme === 'dark' ? '#d1d4dc' : '#131722',
        fontSize: 10,
        fontFamily: "'Outfit', sans-serif"
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(42, 46, 57, 0.2)' } },
      timeScale: { visible: false }
    });
    this.stochKSeries = this.stochChart.addLineSeries({ color: '#2962FF', lineWidth: 1.5 });
    this.stochDSeries = this.stochChart.addLineSeries({ color: '#FF6D00', lineWidth: 1.5 });
  },

  syncOscillatorRange() {
    const range = this.chart.timeScale().getVisibleRange();
    if (range) {
      [this.rsiChart, this.macdChart, this.stochChart].forEach(sub => {
        if (sub) sub.timeScale().setVisibleRange(range);
      });
    }
  },

  resetChartScale() {
    this.chart.timeScale().fitContent();
    this.syncOscillatorRange();
  },

  toggleFullscreen() {
    const viewport = document.getElementById('chart-viewport-box');
    if (!viewport) return;
    if (!document.fullscreenElement) {
      viewport.requestFullscreen().catch(err => {
        console.error('Error entering fullscreen:', err);
      });
    } else {
      document.exitFullscreen();
    }
  },

  /* SVG DRAWINGS SYSTEM OVERLAY */
  setupDrawingCanvas() {
    const container = document.getElementById('chart-viewport-box');
    if (!container) return;
    
    // Activate SVG events when tools are selected
    container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    container.addEventListener('mouseup', (e) => this.handleMouseUp(e));

    // Bind drawings toolbar button clicks
    document.querySelectorAll('.chart-drawings-toolbar .toolbar-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        this.setDrawingTool(tool);
      });
    });

    // Clean up pre-existing default drawings once on first load of this version to open in clean default state
    if (!localStorage.getItem('tv_drawings_cleaned_v2')) {
      localStorage.removeItem(`drawings_${AppState.activeSymbol}`);
      localStorage.removeItem('drawings_BTCUSDT');
      localStorage.removeItem('drawings_ETHUSDT');
      localStorage.removeItem('drawings_SOLUSDT');
      localStorage.removeItem('drawings_BNBUSDT');
      localStorage.removeItem('drawings_ADAUSDT');
      localStorage.removeItem('drawings_XRPUSDT');
      localStorage.setItem('tv_drawings_cleaned_v2', 'true');
    }

    // Restore drawings from local storage
    const saved = localStorage.getItem(`drawings_${AppState.activeSymbol}`);
    if (saved) {
      this.drawings = JSON.parse(saved);
    } else {
      this.drawings = [];
    }
  },

  setDrawingTool(tool) {
    this.activeTool = tool;
    const toast = document.getElementById('drawing-active-toast');
    const label = document.getElementById('current-drawing-tool');
    const svg = document.getElementById('chart-drawing-svg');

    if (!toast) return;

    // Remove active chips styling
    document.querySelectorAll('.chart-drawings-toolbar .toolbar-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    if (tool !== 'select') {
      const activeBtn = document.querySelector(`.chart-drawings-toolbar .toolbar-btn[data-tool="${tool}"]`);
      if (activeBtn) activeBtn.classList.add('active');
      label.innerText = this.getToolLabel(tool);
      toast.style.display = 'flex';
      svg.style.pointerEvents = 'auto'; // intercept clicks
    } else {
      const selectBtn = document.querySelector('.chart-drawings-toolbar .toolbar-btn[data-tool="select"]');
      if (selectBtn) selectBtn.classList.add('active');
      toast.style.display = 'none';
      svg.style.pointerEvents = 'none'; // let chart handle clicks (drag/zoom)
    }

    // Reset current drawing state
    this.isDrawing = false;
    this.currentDrawing = null;
    this.tempDrawingPoints = [];
    this.drawAllSvgShapes();
  },

  cancelDrawingMode() {
    this.setDrawingTool('select');
  },

  getToolLabel(tool) {
    switch(tool) {
      case 'trendline': return 'Trend Line';
      case 'horizontal': return 'Horizontal Line';
      case 'vertical': return 'Vertical Line';
      case 'rectangle': return 'Rectangle';
      case 'circle': return 'Circle';
      case 'arrow': return 'Arrow';
      case 'fibonacci': return 'Fibonacci Retracement';
      case 'brush': return 'Brush Drawing';
      case 'text': return 'Text Label';
      default: return 'Cursor';
    }
  },

  clearDrawings() {
    this.drawings = [];
    localStorage.removeItem(`drawings_${AppState.activeSymbol}`);
    this.drawAllSvgShapes();
    if (window.AppModule && window.AppModule.showToast) {
      window.AppModule.showToast('All chart drawings cleared', 'success');
    }
  },

  // Coordinate Converters
  clientToChartCoords(clientX, clientY) {
    const root = document.getElementById('chart-container-root');
    const rect = root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // Lightweight chart coordinate convert APIs
    const time = this.chart.timeScale().coordinateToTime(x);
    const price = this.activeSeries.coordinateToPrice(y);
    return { time, price, x, y };
  },

  chartToClientCoords(time, price) {
    const x = this.chart.timeScale().timeToCoordinate(time);
    return { x, y: this.activeSeries.priceToCoordinate(price) };
  },

  handleMouseDown(e) {
    if (this.activeTool === 'select') return;
    
    // Check if click is outside drawing SVG
    const svg = document.getElementById('chart-drawing-svg');
    if (e.target !== svg) return;

    e.preventDefault();

    const { time, price } = this.clientToChartCoords(e.clientX, e.clientY);
    if (!time || !price) return;

    this.isDrawing = true;

    if (this.activeTool === 'horizontal') {
      this.drawings.push({
        id: Date.now(),
        type: 'horizontal',
        price: price,
        color: '#ffeb3b'
      });
      this.saveDrawings();
      this.setDrawingTool('select');
    } 
    else if (this.activeTool === 'vertical') {
      this.drawings.push({
        id: Date.now(),
        type: 'vertical',
        time: time,
        color: '#ffeb3b'
      });
      this.saveDrawings();
      this.setDrawingTool('select');
    }
    else if (this.activeTool === 'text') {
      const textVal = prompt('Enter label text:');
      if (textVal) {
        this.drawings.push({
          id: Date.now(),
          type: 'text',
          time,
          price,
          text: textVal,
          color: '#ffffff'
        });
        this.saveDrawings();
      }
      this.setDrawingTool('select');
    }
    else if (this.activeTool === 'brush') {
      this.currentDrawing = {
        id: Date.now(),
        type: 'brush',
        points: [{ time, price }],
        color: '#2962FF'
      };
    }
    else {
      // Trendline, box, circle, arrow, fib
      this.tempDrawingPoints = [{ time, price }];
      this.currentDrawing = {
        id: Date.now(),
        type: this.activeTool,
        points: [{ time, price }, { time, price }],
        color: '#2962FF'
      };
    }
  },

  handleMouseMove(e) {
    if (!this.isDrawing || !this.currentDrawing) return;

    const { time, price } = this.clientToChartCoords(e.clientX, e.clientY);
    if (!time || !price) return;

    if (this.activeTool === 'brush') {
      this.currentDrawing.points.push({ time, price });
    } else {
      this.currentDrawing.points[1] = { time, price };
    }
    this.drawAllSvgShapes();
  },

  handleMouseUp(e) {
    if (!this.isDrawing || !this.currentDrawing) return;
    this.isDrawing = false;

    // Finalize drawing
    this.drawings.push(this.currentDrawing);
    this.saveDrawings();
    this.setDrawingTool('select');
  },

  saveDrawings() {
    localStorage.setItem(`drawings_${AppState.activeSymbol}`, JSON.stringify(this.drawings));
  },

  drawAllSvgShapes() {
    const svg = document.getElementById('chart-drawing-svg');
    if (!svg || !this.chart) return;
    svg.innerHTML = ''; // clear svg layer

    const drawLine = (p1, p2, color, style = '') => {
      const c1 = this.chartToClientCoords(p1.time, p1.price);
      const c2 = this.chartToClientCoords(p2.time, p2.price);
      if (c1.x === null || c2.x === null) return;
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', c1.x);
      line.setAttribute('y1', c1.y);
      line.setAttribute('x2', c2.x);
      line.setAttribute('y2', c2.y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      if (style === 'dashed') line.setAttribute('stroke-dasharray', '5,5');
      svg.appendChild(line);
    };

    const drawArrowShape = (p1, p2, color) => {
      const c1 = this.chartToClientCoords(p1.time, p1.price);
      const c2 = this.chartToClientCoords(p2.time, p2.price);
      if (c1.x === null || c2.x === null) return;
      
      const markerId = `arrowhead-${Date.now()}`;
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', markerId);
      marker.setAttribute('markerWidth', '10');
      marker.setAttribute('markerHeight', '8');
      marker.setAttribute('refX', '8');
      marker.setAttribute('refY', '4');
      marker.setAttribute('orient', 'auto');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L10,4 L0,8 z');
      path.setAttribute('fill', color);
      marker.appendChild(path);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', c1.x);
      line.setAttribute('y1', c1.y);
      line.setAttribute('x2', c2.x);
      line.setAttribute('y2', c2.y);
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', `url(#${markerId})`);
      svg.appendChild(line);
    };

    const drawRect = (p1, p2, color) => {
      const c1 = this.chartToClientCoords(p1.time, p1.price);
      const c2 = this.chartToClientCoords(p2.time, p2.price);
      if (c1.x === null || c2.x === null) return;

      const x = Math.min(c1.x, c2.x);
      const y = Math.min(c1.y, c2.y);
      const width = Math.abs(c1.x - c2.x);
      const height = Math.abs(c1.y - c2.y);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', width);
      rect.setAttribute('height', height);
      rect.setAttribute('stroke', color);
      rect.setAttribute('stroke-width', '1.5');
      rect.setAttribute('fill', 'rgba(41, 98, 255, 0.08)');
      svg.appendChild(rect);
    };

    const drawCircleShape = (p1, p2, color) => {
      const c1 = this.chartToClientCoords(p1.time, p1.price);
      const c2 = this.chartToClientCoords(p2.time, p2.price);
      if (c1.x === null || c2.x === null) return;

      const rx = Math.abs(c1.x - c2.x);
      const ry = Math.abs(c1.y - c2.y);
      const r = Math.sqrt(rx*rx + ry*ry);

      const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circ.setAttribute('cx', c1.x);
      circ.setAttribute('cy', c1.y);
      circ.setAttribute('r', r);
      circ.setAttribute('stroke', color);
      circ.setAttribute('stroke-width', '1.5');
      circ.setAttribute('fill', 'rgba(41, 98, 255, 0.08)');
      svg.appendChild(circ);
    };

    const drawFib = (p1, p2) => {
      const c1 = this.chartToClientCoords(p1.time, p1.price);
      const c2 = this.chartToClientCoords(p2.time, p2.price);
      if (c1.x === null || c2.x === null) return;

      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
      const colors = ['#f44336', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#2196f3', '#9c27b0'];
      const priceDiff = p2.price - p1.price;
      const xStart = Math.min(c1.x, c2.x);
      const xEnd = Math.max(c1.x, c2.x);

      levels.forEach((lvl, i) => {
        const lvlPrice = p1.price + priceDiff * lvl;
        const cLvl = this.chartToClientCoords(p1.time, lvlPrice);

        if (cLvl.y !== null) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', xStart);
          line.setAttribute('y1', cLvl.y);
          line.setAttribute('x2', xEnd);
          line.setAttribute('y2', cLvl.y);
          line.setAttribute('stroke', colors[i]);
          line.setAttribute('stroke-width', '1');
          line.setAttribute('stroke-dasharray', '2,2');
          svg.appendChild(line);

          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', xStart + 5);
          txt.setAttribute('y', cLvl.y - 3);
          txt.setAttribute('fill', colors[i]);
          txt.setAttribute('font-size', '9px');
          txt.setAttribute('font-family', 'monospace');
          txt.textContent = `${(lvl * 100).toFixed(1)}% (${lvlPrice.toFixed(2)})`;
          svg.appendChild(txt);
        }
      });
    };

    const drawBrushShape = (points, color) => {
      if (points.length < 2) return;
      const pathData = [];
      points.forEach((p, index) => {
        const c = this.chartToClientCoords(p.time, p.price);
        if (c.x !== null && c.y !== null) {
          pathData.push(`${index === 0 ? 'M' : 'L'}${c.x},${c.y}`);
        }
      });
      if (pathData.length === 0) return;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathData.join(' '));
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);
    };

    // Render list drawings
    const allDrawings = [...this.drawings];
    if (this.currentDrawing) allDrawings.push(this.currentDrawing);

    allDrawings.forEach(d => {
      if (d.type === 'trendline') {
        drawLine(d.points[0], d.points[1], d.color);
      }
      else if (d.type === 'horizontal') {
        const y = this.activeSeries.priceToCoordinate(d.price);
        if (y !== null) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', 0);
          line.setAttribute('y1', y);
          line.setAttribute('x2', svg.clientWidth);
          line.setAttribute('y2', y);
          line.setAttribute('stroke', d.color);
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('stroke-dasharray', '4,4');
          svg.appendChild(line);
        }
      }
      else if (d.type === 'vertical') {
        const x = this.chart.timeScale().timeToCoordinate(d.time);
        if (x !== null) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', x);
          line.setAttribute('y1', 0);
          line.setAttribute('x2', x);
          line.setAttribute('y2', svg.clientHeight);
          line.setAttribute('stroke', d.color);
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('stroke-dasharray', '4,4');
          svg.appendChild(line);
        }
      }
      else if (d.type === 'rectangle') {
        drawRect(d.points[0], d.points[1], d.color);
      }
      else if (d.type === 'circle') {
        drawCircleShape(d.points[0], d.points[1], d.color);
      }
      else if (d.type === 'arrow') {
        drawArrowShape(d.points[0], d.points[1], d.color);
      }
      else if (d.type === 'fibonacci') {
        drawFib(d.points[0], d.points[1]);
      }
      else if (d.type === 'brush') {
        drawBrushShape(d.points, d.color);
      }
      else if (d.type === 'text') {
        const c = this.chartToClientCoords(d.time, d.price);
        if (c.x !== null && c.y !== null) {
          const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          txt.setAttribute('x', c.x + 4);
          txt.setAttribute('y', c.y - 4);
          txt.setAttribute('fill', d.color);
          txt.setAttribute('font-size', '11px');
          txt.setAttribute('font-weight', '600');
          txt.textContent = d.text;
          svg.appendChild(txt);
          
          const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circ.setAttribute('cx', c.x);
          circ.setAttribute('cy', c.y);
          circ.setAttribute('r', '3');
          circ.setAttribute('fill', d.color);
          svg.appendChild(circ);
        }
      }
    });
  }
};
