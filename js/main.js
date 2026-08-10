/* Entry point bootstrapping, DOM event bindings, global namespace bindings */

window.switchTab = function(tabId) {
  AppState.activeTab = tabId;
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabId}`);
  });

  if (tabId === 'portfolio') {
    renderPortfolio();
  }
};

window.changeChartType = function(type, label) {
  const el = document.getElementById('chart-type-label');
  if (el) el.innerText = label;
  closeAllDropdowns();
  ChartEngine.changeSeriesType(type);
};

window.openIndicatorConfig = function(name) {
  AppState.activeConfigIndicator = name;
  const overlay = document.getElementById('indicator-settings-overlay');
  const title = document.getElementById('ind-settings-title');
  const paramLbl = document.getElementById('ind-settings-param-lbl');
  const paramVal = document.getElementById('ind-settings-param-val');
  const colorVal = document.getElementById('ind-settings-color-val');

  if (!overlay) return;
  const config = ChartEngine.indicatorConfig[name];

  overlay.style.display = 'flex';
  title.innerText = `${name.toUpperCase()} Parameters`;
  colorVal.value = config.color || '#2962FF';
  
  if (name === 'bb') {
    paramLbl.innerText = 'Period';
    paramVal.value = config.period;
  } else if (name === 'rsi') {
    paramLbl.innerText = 'RSI Period';
    paramVal.value = config.period;
  } else {
    paramLbl.innerText = 'Period';
    paramVal.value = config.period || 9;
  }
};

window.closeIndicatorConfig = function() {
  const overlay = document.getElementById('indicator-settings-overlay');
  if (overlay) overlay.style.display = 'none';
};

window.saveIndicatorConfig = function() {
  const name = AppState.activeConfigIndicator;
  const paramVal = parseInt(document.getElementById('ind-settings-param-val').value) || 9;
  const colorVal = document.getElementById('ind-settings-color-val').value;

  const settings = { color: colorVal };
  settings.period = paramVal;

  ChartEngine.updateIndicatorConfig(name, settings);
  closeIndicatorConfig();
  showToast('Indicator configurations updated', 'success');
};

window.renderHeader = function() {
  const authGuest = document.getElementById('auth-section-guest');
  const authUser = document.getElementById('auth-section-user');
  const headerName = document.getElementById('header-username');
  const headerAvatar = document.getElementById('header-user-avatar');

  if (!authGuest) return;

  if (AppState.user) {
    authGuest.style.display = 'none';
    authUser.style.display = 'flex';
    headerName.innerText = AppState.user.username;
    
    const avatar = AppState.user.avatar || 'user';
    headerAvatar.innerHTML = `<i data-lucide="${avatar}" class="text-green"></i>`;
  } else {
    authGuest.style.display = 'flex';
    authUser.style.display = 'none';
  }
  lucide.createIcons();
};

window.updateHeaderTickerDom = function() {
  const track = document.getElementById('ticker-marquee-track');
  if (!track) return;

  let html = '';
  const tickers = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT'];
  
  const buildItem = (sym) => {
    const data = AppState.livePrices[sym] || { price: 0, change: '0.00' };
    const isUp = parseFloat(data.change) >= 0;
    const changeClass = isUp ? 'text-green' : 'text-red';
    const changeSign = isUp ? '+' : '';
    return `
      <div class="ticker-item" onclick="window.App.navigateToChart('${sym}')">
        <span class="ticker-symbol">${sym.replace('USDT','')}</span>
        <span class="ticker-price ${changeClass}">$${data.price.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
        <span class="ticker-change ${changeClass}">${changeSign}${data.change}%</span>
      </div>
    `;
  };

  tickers.forEach(s => html += buildItem(s));
  tickers.forEach(s => html += buildItem(s));

  track.innerHTML = html;
};

window.renderMarketSummary = function() {
  updateMarketSummaryDom();
};

window.updateMarketSummaryDom = function() {
  const container = document.getElementById('market-summary-container');
  if (!container) return;

  const cards = [
    { sym: 'BTCUSDT', name: 'Bitcoin' },
    { sym: 'ETHUSDT', name: 'Ethereum' },
    { sym: 'SOLUSDT', name: 'Solana' },
    { sym: 'BNBUSDT', name: 'BNB' }
  ];

  let html = '';
  cards.forEach(c => {
    const data = AppState.livePrices[c.sym] || { price: 0, change: '0.00' };
    const isUp = parseFloat(data.change) >= 0;
    const changeClass = isUp ? 'text-green' : 'text-red';
    const changeSign = isUp ? '+' : '';
    html += `
      <div class="market-summary-card" onclick="window.App.selectSymbol('${c.sym}')">
        <div class="market-card-left">
          <span class="market-card-title">${c.name}</span>
          <span class="market-card-price">$${data.price.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
        </div>
        <span class="market-card-change ${changeClass}">${changeSign}${data.change}%</span>
      </div>
    `;
  });

  container.innerHTML = html;
};

window.updateActiveSymbolPrice = function(price, change) {
  const detailPrice = document.getElementById('detail-price');
  if (detailPrice) {
    detailPrice.innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits:2})}`;
    detailPrice.className = `val highlight ${parseFloat(change) >= 0 ? 'text-green' : 'text-red'}`;
  }

  const orderCostQuote = document.getElementById('cost-quote-price');
  if (orderCostQuote) {
    orderCostQuote.innerText = `$${price.toLocaleString(undefined, {minimumFractionDigits:2})}`;
  }
  
  if (AppState.orderType === 'MARKET') {
    const input = document.getElementById('trade-order-price');
    if (input) input.value = price;
    calculateOrderCost();
  }

  recalculateHoldingsValuation();
};

window.renderTimeframes = function() {
  const timeframes = [
    { label: '1m', value: '1m' },
    { label: '5m', value: '5m' },
    { label: '15m', value: '15m' },
    { label: '30m', value: '30m' },
    { label: '1h', value: '1h' },
    { label: '4h', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1M' }
  ];

  const group = document.getElementById('timeframe-buttons-group');
  if (!group) return;

  group.innerHTML = timeframes.map(tf => `
    <button 
      class="timeframe-btn ${AppState.activeTimeframe === tf.value ? 'active' : ''}" 
      onclick="window.App.changeTimeframe('${tf.value}')"
    >
      ${tf.label}
    </button>
  `).join('');
};

window.changeTimeframe = function(tf) {
  AppState.activeTimeframe = tf;
  renderTimeframes();
  ChartEngine.loadData(AppState.activeSymbol, tf);
};

window.handleHeroSearch = function(val) {
  const box = document.getElementById('hero-search-suggestions');
  if (!box) return;
  if (!val) {
    box.style.display = 'none';
    return;
  }

  const query = val.toUpperCase().trim();
  const matches = AppState.assetList.filter(a => 
    a.symbol.includes(query) || a.name.toUpperCase().includes(query)
  );

  if (matches.length > 0) {
    box.style.display = 'block';
    box.innerHTML = matches.map(a => `
      <div onclick="window.App.handleHeroSearchClick('${a.symbol}')">
        <strong>${a.symbol.replace('USDT','')}</strong> - ${a.name} (Crypto)
      </div>
    `).join('');
  } else {
    box.style.display = 'none';
  }
};

window.handleHeroSearchClick = function(symbol) {
  const input = document.getElementById('hero-search-input');
  if (input) input.value = symbol;
  document.getElementById('hero-search-suggestions').style.display = 'none';
  navigateToChart(symbol);
};

window.triggerHeroSearch = function() {
  const val = document.getElementById('hero-search-input').value.toUpperCase().trim();
  if (!val) return;

  let symbol = val;
  if (!val.endsWith('USDT')) symbol = `${val}USDT`;

  const match = AppState.assetList.find(a => a.symbol === symbol);
  if (match) {
    navigateToChart(symbol);
  } else {
    showToast(`Search match not found for ${val}`, 'error');
  }
};

window.navigateToChart = function(symbol) {
  window.location.hash = `#/chart?symbol=${symbol}`;
};

window.handlePriceTick = function(symbol, price) {
  const oldPriceObj = AppState.livePrices[symbol] || { change: '0.00' };
  const change = oldPriceObj.change;
  
  let flashClass = '';
  if (price > oldPriceObj.price) flashClass = 'flash-up';
  else if (price < oldPriceObj.price) flashClass = 'flash-down';

  AppState.livePrices[symbol] = { price, change, flash: flashClass };

  updateWatchlistDom();
  updateHeaderTickerDom();
  updateMarketSummaryDom();

  if (AppState.activeView === 'home' && AppState.activeOverviewTab === 'crypto') {
    updateOverviewCryptoLiveRow(symbol, price, change);
  }

  if (AppState.activeView === 'markets-crypto') {
    updateCryptoOverviewLiveCards(symbol, price, change);
  }

  if (symbol === AppState.activeSymbol) {
    updateActiveSymbolPrice(price, change);
  }

  checkPriceAlerts(symbol, price);
};

window.initTickerStream = function() {
  const symbolsLower = AppState.watchlist.map(s => `${s.toLowerCase()}@ticker`);
  if (!AppState.watchlist.includes(AppState.activeSymbol)) {
    symbolsLower.push(`${AppState.activeSymbol.toLowerCase()}@ticker`);
  }
  if (!symbolsLower.includes('xrpusdt@ticker')) {
    symbolsLower.push('xrpusdt@ticker');
  }

  const streamPath = symbolsLower.join('/');
  const tickerWs = new WebSocket(`wss://stream.binance.com:9443/ws/${streamPath}`);
  const flashTimers = {};

  tickerWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg && msg.s) {
      const symbol = msg.s;
      const price = parseFloat(msg.c);
      const change = parseFloat(msg.P).toFixed(2);
      
      const oldPriceObj = AppState.livePrices[symbol];
      let flashClass = '';
      if (oldPriceObj) {
        if (price > oldPriceObj.price) flashClass = 'flash-up';
        else if (price < oldPriceObj.price) flashClass = 'flash-down';
      }

      AppState.livePrices[symbol] = { price, change, flash: flashClass };

      if (flashClass) {
        if (flashTimers[symbol]) clearTimeout(flashTimers[symbol]);
        flashTimers[symbol] = setTimeout(() => {
          if (AppState.livePrices[symbol]) {
            AppState.livePrices[symbol].flash = '';
            updateWatchlistDom();
          }
        }, 350);
      }

      updateWatchlistDom();
      updateHeaderTickerDom();
      updateMarketSummaryDom();

      if (AppState.activeView === 'home' && AppState.activeOverviewTab === 'crypto') {
        updateOverviewCryptoLiveRow(symbol, price, change);
      }

      if (AppState.activeView === 'markets-crypto') {
        updateCryptoOverviewLiveCards(symbol, price, change);
      }

      if (symbol === AppState.activeSymbol) {
        updateActiveSymbolPrice(price, change);
      }

      checkPriceAlerts(symbol, price);
    }
  };
};

window.renderAll = function() {
  renderHeader();
  renderMarketSummary();
  renderTimeframes();
  updateWatchlistDom();
  renderNews();
  renderPortfolio();
  renderAlerts();
  renderDetails();
  renderProfile();
  renderOverviewTable();
};

// BIND GLOBAL App INTERFACE FOR INLINE HTML LISTENERS
window.App = {
  toggleMarketsDropdown,
  toggleMobileMenu,
  focusSearchInput,
  openAuthModal,
  closeAuthModal,
  toggleAuthMode,
  handleAuthSubmit,
  handleLogout,
  setOverviewTab,
  handleAddToWatchlist,
  handleSearchInput,
  setWatchlistFilter,
  filterNews,
  handleNewsSearch,
  setTradeSide,
  setOrderType,
  calculateOrderCost,
  handlePlaceOrder,
  handleCreateAlert,
  changeAvatar,
  setTheme,
  setPrefTimeframe,
  updatePassword,
  closeIndicatorConfig,
  saveIndicatorConfig,
  switchTab,
  changeChartType,
  openIndicatorConfig,
  navigateToChart,
  changeTimeframe,
  handleHeroSearch,
  handleHeroSearchClick,
  triggerHeroSearch
};

// Also expose as AppModule internally
window.AppModule = {
  selectSymbol,
  toggleFavorite,
  handleRemoveFromWatchlist,
  handleSuggestionClick,
  handleDeleteAlert,
  showToast,
  updateDetailsPanel,
  handlePriceTick
};

// DOM Bootloader
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  initTickerStream();
  handleRouting();
  renderAll();
  ChartEngine.init();
  lucide.createIcons();
  drawIdeaMockupCharts();
  showToast('TradingView terminal loaded successfully', 'success');

  window.addEventListener('hashchange', handleRouting);
});
