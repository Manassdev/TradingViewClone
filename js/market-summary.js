(function() {
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];
  const COIN_NAMES = {
    'BTCUSDT': { name: 'Bitcoin', symbol: 'BTC', logoClass: 'btc' },
    'ETHUSDT': { name: 'Ethereum', symbol: 'ETH', logoClass: 'eth' },
    'BNBUSDT': { name: 'BNB', symbol: 'BNB', logoClass: 'bnb' },
    'SOLUSDT': { name: 'Solana', symbol: 'SOL', logoClass: 'sol' },
    'XRPUSDT': { name: 'XRP', symbol: 'XRP', logoClass: 'xrp' },
    'DOGEUSDT': { name: 'Dogecoin', symbol: 'DOGE', logoClass: 'doge' }
  };

  async function fetchMarketData() {
    try {
      // 1. Fetch current prices & changes
      const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(SYMBOLS)}`);
      const data = await response.json();
      
      // Update Right Card List
      updateListDom(data);

      // Update Left Card BTC info
      const btcData = data.find(item => item.symbol === 'BTCUSDT');
      if (btcData) {
        const price = parseFloat(btcData.lastPrice);
        const change = parseFloat(btcData.priceChangePercent);
        
        const priceEl = document.getElementById('btc-price-large');
        const changeEl = document.getElementById('btc-change-large');
        
        if (priceEl) priceEl.innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
        if (changeEl) {
          changeEl.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
          changeEl.className = `coin-change-large ${change >= 0 ? 'text-green' : 'text-red'}`;
        }
      }

      // 2. Fetch BTC klines for chart (last 24 hours, 1h interval)
      const chartResponse = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24');
      const chartData = await chartResponse.json();
      
      drawBtcLargeChart(chartData);

    } catch (error) {
      console.error('Error fetching market summary data:', error);
    }
  }

  function updateListDom(data) {
    const listWrapper = document.getElementById('major-cryptos-list');
    if (!listWrapper) return;

    let html = '';
    SYMBOLS.forEach(symbol => {
      const coin = data.find(item => item.symbol === symbol);
      if (!coin) return;

      const meta = COIN_NAMES[symbol];
      const price = parseFloat(coin.lastPrice);
      const change = parseFloat(coin.priceChangePercent);
      const isUp = change >= 0;

      const formattedPrice = price >= 100 ? price.toLocaleString(undefined, {minimumFractionDigits: 2}) :
                             price >= 1 ? price.toFixed(2) : price.toFixed(4);

      html += `
        <div class="crypto-list-item" onclick="window.navigateToChart('${symbol}')">
          <div class="list-item-left">
            <div class="coin-logo-mini ${meta.logoClass}">${meta.symbol[0]}</div>
            <div class="coin-meta">
              <span class="coin-title">${meta.name}</span>
              <span class="coin-subtitle-pill">${meta.symbol}</span>
            </div>
          </div>
          <div class="list-item-right">
            <span class="coin-price">$${formattedPrice}</span>
            <span class="coin-change ${isUp ? 'text-green' : 'text-red'}">${isUp ? '+' : ''}${change.toFixed(2)}%</span>
          </div>
        </div>
      `;
    });

    listWrapper.innerHTML = html;
  }

  function drawBtcLargeChart(klines) {
    const canvas = document.getElementById('btc-large-chart');
    if (!canvas) return;

    // Set resolution to match container bounding box
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Extract close prices
    const prices = klines.map(k => parseFloat(k[4]));
    const times = klines.map(k => {
      const date = new Date(k[0]);
      return `${String(date.getHours()).padStart(2, '0')}:00`;
    });

    // Update bottom labels
    const labelContainer = document.querySelector('.chart-time-labels');
    if (labelContainer) {
      const step = Math.floor(times.length / 6);
      let labelHtml = '';
      for (let i = 0; i < 7; i++) {
        const index = Math.min(i * step, times.length - 1);
        labelHtml += `<span>${times[index]}</span>`;
      }
      labelContainer.innerHTML = labelHtml;
    }

    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;

    // Draw Grid Lines (TV Style for light background)
    ctx.strokeStyle = 'rgba(19, 23, 34, 0.04)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 1; i < gridLines; i++) {
      const y = (h / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    const vGridLines = 6;
    for (let i = 1; i < vGridLines; i++) {
      const x = (w / vGridLines) * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const isUp = lastPrice >= firstPrice;
    const themeColor = isUp ? '#089981' : '#f23645';

    const points = [];
    const padding = h * 0.15;
    const plotHeight = h - padding * 2;

    prices.forEach((price, index) => {
      const x = (w / (prices.length - 1)) * index;
      const y = h - padding - ((price - minPrice) / priceRange) * plotHeight;
      points.push({ x, y });
    });

    // Area fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, isUp ? 'rgba(8, 153, 129, 0.18)' : 'rgba(242, 54, 69, 0.18)');
    gradient.addColorStop(1, isUp ? 'rgba(8, 153, 129, 0)' : 'rgba(242, 54, 69, 0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Main line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  window.addEventListener('DOMContentLoaded', () => {
    fetchMarketData();
    setInterval(fetchMarketData, 30000);
  });
})();
