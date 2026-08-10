/* UI components drawer, overview charts, drop-downs, and popups logic */

window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-alerts-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  if (type === 'warning') iconName = 'bell';

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <div class="toast-content">
      <div class="toast-title">${type.toUpperCase()}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);
  lucide.createIcons();

  setTimeout(() => {
    toast.style.animation = 'slide-in 0.3s ease reverse forwards';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
};

window.toggleDropdown = function(id) {
  const dd = document.getElementById(id);
  if (!dd) return;
  if (dd.classList.contains('active')) {
    dd.classList.remove('active');
    AppState.activeDropdownId = null;
  } else {
    closeAllDropdowns();
    dd.classList.add('active');
    AppState.activeDropdownId = id;
  }
};

window.closeAllDropdowns = function() {
  document.querySelectorAll('.dropdown-menu').forEach(dd => {
    dd.classList.remove('active');
  });
  const marketsMenu = document.getElementById('markets-dropdown-menu');
  if (marketsMenu) marketsMenu.style.display = 'none';
  AppState.activeDropdownId = null;
};

window.toggleMarketsDropdown = function(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const menu = document.getElementById('markets-dropdown-menu');
  if (!menu) return;
  if (menu.style.display === 'flex') {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'flex';
  }
};

window.toggleMobileMenu = function() {
  const menu = document.querySelector('.header-menu');
  if (menu) {
    menu.classList.toggle('mobile-active');
  }
};

window.focusSearchInput = function() {
  window.location.hash = '#/chart';
  setTimeout(() => {
    const input = document.getElementById('watchlist-search-input');
    if (input) input.focus();
  }, 100);
};

window.drawSparkline = function(canvasId, isUp) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const pointsCount = 10;
  const points = [];
  let currentVal = h / 2;
  points.push({ x: 0, y: currentVal });

  for (let i = 1; i < pointsCount; i++) {
    const x = (w / (pointsCount - 1)) * i;
    const trend = isUp ? -1.2 : 1.2;
    const noise = (Math.random() - 0.5) * 8;
    currentVal = currentVal + (trend + noise);
    if (currentVal < 3) currentVal = 3;
    if (currentVal > h - 3) currentVal = h - 3;
    points.push({ x, y: currentVal });
  }

  if (isUp) points[pointsCount - 1].y = 5 + Math.random() * 5;
  else points[pointsCount - 1].y = h - 10 + Math.random() * 5;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i - 1].x) / 2;
    const yc = (points[i].y + points[i - 1].y) / 2;
    ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  
  ctx.strokeStyle = isUp ? '#089981' : '#f23645';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  if (isUp) {
    gradient.addColorStop(0, 'rgba(8, 153, 129, 0.18)');
    gradient.addColorStop(1, 'rgba(8, 153, 129, 0.00)');
  } else {
    gradient.addColorStop(0, 'rgba(242, 54, 69, 0.18)');
    gradient.addColorStop(1, 'rgba(242, 54, 69, 0.00)');
  }
  ctx.fillStyle = gradient;
  ctx.fill();
};

window.renderOverviewTable = function() {
  const tbody = document.getElementById('overview-table-body');
  if (!tbody) return;

  let html = '';
  let items = [];

  if (AppState.activeOverviewTab === 'crypto') {
    items = AppState.assetList.slice(0, 6).map(a => {
      const live = AppState.livePrices[a.symbol] || { price: 0, change: '0.00' };
      return {
        symbol: a.symbol,
        cleanSym: a.symbol.replace('USDT',''),
        name: a.name,
        price: live.price,
        change: live.change,
        isCrypto: true
      };
    });
  } else if (AppState.activeOverviewTab === 'stocks') {
    items = AppState.stockList.map(s => ({
      symbol: s.symbol,
      cleanSym: s.symbol,
      name: s.name,
      price: s.price,
      change: s.change,
      isCrypto: false
    }));
  } else {
    items = AppState.indexList.map(i => ({
      symbol: i.symbol,
      cleanSym: i.symbol,
      name: i.name,
      price: i.price,
      change: i.change,
      isCrypto: false
    }));
  }

  tbody.innerHTML = items.map(item => {
    const isUp = parseFloat(item.change) >= 0;
    const changeClass = isUp ? 'text-green' : 'text-red';
    const changeSign = isUp ? '+' : '';
    
    // Explicit onclick actions
    const clickAction = item.isCrypto 
      ? `window.location.hash = '#/chart?symbol=${item.symbol}'`
      : `window.AppModule.showToast('Demo chart only supports Crypto assets','warning')`;
    
    const priceText = item.price === 0 ? 'Loading...' : `$${item.price.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    
    return `
      <tr onclick="${clickAction}">
        <td style="font-weight:700; color:var(--tv-blue);">${item.cleanSym}</td>
        <td>${item.name}</td>
        <td id="ov-row-price-${item.symbol}" style="font-family:monospace; font-weight:600;">${priceText}</td>
        <td id="ov-row-change-${item.symbol}" class="${changeClass}">${changeSign}${item.change}%</td>
        <td>
          <canvas class="sparkline-canvas" id="spark-${item.symbol}" width="80" height="28"></canvas>
        </td>
        <td style="text-align: right;">
          <button class="overview-launch-btn">View Chart</button>
        </td>
      </tr>
    `;
  }).join('');

  items.forEach(item => {
    drawSparkline(`spark-${item.symbol}`, parseFloat(item.change) >= 0);
  });
};

window.updateOverviewCryptoLiveRow = function(symbol, price, change) {
  const priceCell = document.getElementById(`ov-row-price-${symbol}`);
  const changeCell = document.getElementById(`ov-row-change-${symbol}`);
  if (priceCell && changeCell) {
    priceCell.innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    const isUp = parseFloat(change) >= 0;
    changeCell.className = isUp ? 'text-green' : 'text-red';
    changeCell.innerText = `${isUp ? '+' : ''}${change}%`;
    drawSparkline(`spark-${symbol}`, isUp);
  }
};

window.setOverviewTab = function(tab) {
  AppState.activeOverviewTab = tab;
  document.getElementById('ov-tab-crypto').classList.toggle('active', tab === 'crypto');
  document.getElementById('ov-tab-stocks').classList.toggle('active', tab === 'stocks');
  document.getElementById('ov-tab-indices').classList.toggle('active', tab === 'indices');
  renderOverviewTable();
};

window.renderCryptoOverviewData = function() {
  const list = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT'];
  list.forEach(symbol => {
    const data = AppState.livePrices[symbol] || { price: 0, change: '0.00' };
    updateCryptoOverviewLiveCards(symbol, data.price, data.change);
  });

  drawTotalCapChart();
  drawStableCapChart();
};

window.updateCryptoOverviewLiveCards = function(symbol, price, change) {
  const priceSpan = document.getElementById('summary-price-' + symbol);
  const changeSpan = document.getElementById('summary-change-' + symbol);
  if (priceSpan && changeSpan) {
    if (price > 0) {
      priceSpan.innerHTML = `${price.toLocaleString(undefined, {minimumFractionDigits: symbol === 'XRPUSDT' ? 4 : 2})}<span style="font-size:10px;color:#787b86;font-weight:500;margin-left:2px;">USD</span>`;
    } else {
      priceSpan.innerText = 'Loading...';
    }
    
    const isUp = parseFloat(change) >= 0;
    changeSpan.className = `change ${isUp ? 'text-green' : 'text-red'}`;
    changeSpan.innerText = `${isUp ? '+' : ''}${change}%`;
  }
};

window.drawTotalCapChart = function() {
  const canvas = document.getElementById('canvas-widget-total-cap');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 40; x < w; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 30; y < h; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const points = [
    { x: 0, y: h - 40 },
    { x: w * 0.15, y: h - 50 },
    { x: w * 0.3, y: h - 35 },
    { x: w * 0.45, y: h - 80 },
    { x: w * 0.6, y: h - 60 },
    { x: w * 0.75, y: h - 140 },
    { x: w * 0.9, y: h - 100 },
    { x: w, y: 30 }
  ];

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i-1].x) / 2;
    const yc = (points[i].y + points[i-1].y) / 2;
    ctx.quadraticCurveTo(points[i-1].x, points[i-1].y, xc, yc);
  }
  ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
  ctx.strokeStyle = '#089981';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(8, 153, 129, 0.15)');
  grad.addColorStop(1, 'rgba(8, 153, 129, 0.00)');
  ctx.fillStyle = grad;
  ctx.fill();
};

window.drawStableCapChart = function() {
  const canvas = document.getElementById('canvas-widget-stable-cap');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const points = [
    { x: 0, y: 15 },
    { x: w * 0.2, y: 20 },
    { x: w * 0.4, y: 40 },
    { x: w * 0.6, y: 35 },
    { x: w * 0.8, y: 60 },
    { x: w, y: h - 15 }
  ];

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    const xc = (points[i].x + points[i-1].x) / 2;
    const yc = (points[i].y + points[i-1].y) / 2;
    ctx.quadraticCurveTo(points[i-1].x, points[i-1].y, xc, yc);
  }
  ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
  ctx.strokeStyle = '#f23645';
  ctx.lineWidth = 2;
  ctx.stroke();
};

window.drawIdeaMockupCharts = function() {
  const drawCandlesWithIndicators = (canvasId, isUp) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.8;
    for (let x = 20; x < w; x += 25) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 15; y < h; y += 20) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const count = 22;
    const barW = Math.floor(w / count) - 4;
    let lastClose = isUp ? h - 30 : 30;
    const closePoints = [];

    for (let i = 0; i < count; i++) {
      const x = (w / count) * i + 2;
      const trend = isUp ? -1.8 : 1.8;
      const noise = (Math.random() - 0.5) * 18;
      const open = lastClose;
      const close = open + (trend + noise);

      const high = Math.min(open, close) - Math.random() * 8;
      const low = Math.max(open, close) + Math.random() * 8;
      const isCandleUp = close <= open;

      ctx.strokeStyle = isCandleUp ? '#089981' : '#f23645';
      ctx.fillStyle = isCandleUp ? 'rgba(8, 153, 129, 0.4)' : 'rgba(242, 54, 69, 0.4)';
      ctx.lineWidth = 1;

      ctx.beginPath(); ctx.moveTo(x + barW/2, high); ctx.lineTo(x + barW/2, low); ctx.stroke();
      ctx.fillRect(x, Math.min(open, close), barW, Math.max(1, Math.abs(close - open)));
      ctx.strokeRect(x, Math.min(open, close), barW, Math.max(1, Math.abs(close - open)));

      lastClose = close;
      closePoints.push({ x: x + barW/2, y: close });
    }

    ctx.beginPath();
    ctx.moveTo(closePoints[0].x, closePoints[0].y - 5);
    for (let i = 1; i < closePoints.length; i++) {
      ctx.lineTo(closePoints[i].x, closePoints[i].y - 5);
    }
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (canvasId === 'mock-chart-idea-1') {
      ctx.fillStyle = 'rgba(242, 54, 69, 0.1)';
      ctx.strokeStyle = '#f23645';
      ctx.lineWidth = 1;
      ctx.fillRect(w * 0.4, 20, w * 0.4, 30);
      ctx.strokeRect(w * 0.4, 20, w * 0.4, 30);

      ctx.fillStyle = '#f23645';
      ctx.font = '8px monospace';
      ctx.fillText('Supply Zone', w * 0.42, 35);
    }
  };

  const drawAuctionGraphic = (canvasId) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.8;
    for (let y = 15; y < h; y += 15) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const rows = 10;
    for (let i = 0; i < rows; i++) {
      const y = (h / rows) * i + 2;
      const rowH = (h / rows) - 3;
      
      const dist = Math.abs(i - rows/2);
      const barW = (w * 0.6) * Math.exp(-dist * dist / 8);

      ctx.fillStyle = i < rows/2 ? 'rgba(242, 54, 69, 0.15)' : 'rgba(8, 153, 129, 0.15)';
      ctx.strokeStyle = i < rows/2 ? '#f23645' : '#089981';
      ctx.lineWidth = 0.8;

      ctx.fillRect(0, y, barW, rowH);
      ctx.strokeRect(0, y, barW, rowH);
    }

    ctx.beginPath();
    ctx.moveTo(w * 0.1, h - 20);
    ctx.lineTo(w * 0.9, 20);
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('Value Area High', w * 0.5, 45);
    ctx.fillText('Value Area Low', w * 0.3, h - 35);
  };

  drawCandlesWithIndicators('mock-chart-idea-1', true);
  drawAuctionGraphic('mock-chart-idea-2');
  drawCandlesWithIndicators('mock-chart-idea-3', true);
};

window.renderDetails = function() {
  const symbol = AppState.activeSymbol;
  const cleanSym = symbol.replace('USDT','');
  const asset = AppState.assetList.find(a => a.symbol === symbol) || { name: cleanSym, desc: 'Cryptocurrency market feed loaded from Binance.' };

  document.getElementById('details-company-name').innerText = `${asset.name} (${cleanSym})`;
  document.getElementById('details-company-desc').innerText = asset.desc;
  document.getElementById('detail-symbol').innerText = symbol;

  let marketCap = '$-';
  let peRatio = 'N/A';
  let range52 = '$-';
  let dividend = '0.00%';

  const live = AppState.livePrices[symbol] || { price: 65000 };
  const price = live.price || 65000;

  if (symbol === 'BTCUSDT') {
    marketCap = '$1.28 Trillion';
    range52 = `$49,000.00 - $73,750.00`;
  } else if (symbol === 'ETHUSDT') {
    marketCap = '$410.5 Billion';
    range52 = `$2,100.00 - $4,090.00`;
  } else if (symbol === 'SOLUSDT') {
    marketCap = '$74.2 Billion';
    range52 = `$80.00 - $210.00`;
  } else {
    marketCap = `$${((price * 100000000) / 1000000).toFixed(1)} Million`;
    range52 = `$${(price * 0.7).toFixed(2)} - $${(price * 1.3).toFixed(2)}`;
  }

  document.getElementById('detail-market-cap').innerText = marketCap;
  document.getElementById('detail-52w-range').innerText = range52;
  document.getElementById('detail-pe-ratio').innerText = peRatio;
  document.getElementById('detail-dividend-yield').innerText = dividend;
};

