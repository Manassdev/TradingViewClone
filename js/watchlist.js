/* Watchlist elements rendering, filters, updates, and searches */

window.renderWatchlist = function() {
  updateWatchlistDom();
};

window.updateWatchlistDom = function() {
  const list = document.getElementById('watchlist-items-list');
  if (!list) return;

  let items = AppState.watchlist;
  if (AppState.watchlistFilter === 'favorites') {
    items = items.filter(s => AppState.favorites.includes(s));
  }

  let html = '';
  items.forEach(symbol => {
    const data = AppState.livePrices[symbol] || { price: 0, change: '0.00', flash: '' };
    const isUp = parseFloat(data.change) >= 0;
    const changeClass = isUp ? 'text-green' : 'text-red';
    const cleanName = symbol.replace('USDT', '');
    const isStarred = AppState.favorites.includes(symbol);
    const starredClass = isStarred ? 'starred' : '';
    const activeClass = AppState.activeSymbol === symbol ? 'active' : '';

    html += `
      <div class="watchlist-item ${activeClass}" onclick="window.AppModule.selectSymbol('${symbol}')">
        <div class="watchlist-item-left">
          <span class="watchlist-item-name">${cleanName}</span>
          <span class="watchlist-item-desc">Crypto / USDT</span>
        </div>
        <div class="watchlist-item-right">
          <div class="watchlist-item-price-block">
            <span class="watchlist-item-price ${data.flash}">
              $${data.price.toLocaleString(undefined, {minimumFractionDigits:2})}
            </span>
            <span class="watchlist-item-change ${changeClass}">
              ${isUp ? '+' : ''}${data.change}%
            </span>
          </div>
          <button 
            class="watchlist-star-btn ${starredClass}" 
            onclick="event.stopPropagation(); window.AppModule.toggleFavorite('${symbol}')"
            title="Add to Favorites"
          >
            <i data-lucide="star" style="width:14px; height:14px;"></i>
          </button>
          <button 
            class="watchlist-remove-btn" 
            onclick="event.stopPropagation(); window.AppModule.handleRemoveFromWatchlist('${symbol}')"
            title="Remove Ticker"
          >
            <i data-lucide="x" style="width:14px; height:14px;"></i>
          </button>
        </div>
      </div>
    `;
  });

  if (items.length === 0) {
    html = `<div style="padding:40px 20px; text-align:center; color:var(--text-secondary); font-size:13px;">No items to display</div>`;
  }

  list.innerHTML = html;
  lucide.createIcons();
};

window.selectSymbol = function(symbol) {
  AppState.activeSymbol = symbol;
  
  const badge = document.getElementById('active-symbol-badge');
  if (badge) badge.innerText = symbol;
  const alertSymbol = document.getElementById('alert-form-symbol');
  if (alertSymbol) alertSymbol.value = symbol;
  const tradeSymbol = document.getElementById('trade-qty-symbol');
  if (tradeSymbol) tradeSymbol.innerText = symbol.replace('USDT','');
  
  updateWatchlistDom();
  renderDetails();
  
  if (ChartEngine.loadData) {
    ChartEngine.loadData(symbol, AppState.activeTimeframe);
  }
};

window.toggleFavorite = function(symbol) {
  const index = AppState.favorites.indexOf(symbol);
  if (index >= 0) {
    AppState.favorites.splice(index, 1);
  } else {
    AppState.favorites.push(symbol);
  }
  saveState('watchlist');
  updateWatchlistDom();
};

window.setWatchlistFilter = function(filter) {
  AppState.watchlistFilter = filter;
  document.getElementById('filter-all').classList.toggle('active', filter === 'all');
  document.getElementById('filter-favorites').classList.toggle('active', filter === 'favorites');
  updateWatchlistDom();
};

window.handleSearchInput = function(val) {
  const box = document.getElementById('search-suggestions-box');
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
      <div onclick="window.AppModule.handleSuggestionClick('${a.symbol}')">
        <strong>${a.symbol.replace('USDT','')}</strong> - ${a.name}
      </div>
    `).join('');
  } else {
    box.style.display = 'none';
  }
};

window.handleSuggestionClick = function(symbol) {
  const input = document.getElementById('watchlist-search-input');
  if (input) input.value = symbol;
  document.getElementById('search-suggestions-box').style.display = 'none';
  addSymbolToWatchlist(symbol);
};

window.handleAddToWatchlist = function(e) {
  e.preventDefault();
  const input = document.getElementById('watchlist-search-input');
  const val = input.value.toUpperCase().trim();
  if (!val) return;

  let symbol = val;
  if (!val.endsWith('USDT')) symbol = `${val}USDT`;

  addSymbolToWatchlist(symbol);
  input.value = '';
  document.getElementById('search-suggestions-box').style.display = 'none';
};

window.addSymbolToWatchlist = function(symbol) {
  if (AppState.watchlist.includes(symbol)) {
    showToast('Ticker already in watchlist', 'warning');
    return;
  }

  AppState.watchlist.push(symbol);
  saveState('watchlist');
  updateWatchlistDom();
  showToast(`Added ${symbol} to watchlist`, 'success');
};

window.handleRemoveFromWatchlist = function(symbol) {
  AppState.watchlist = AppState.watchlist.filter(s => s !== symbol);
  saveState('watchlist');
  updateWatchlistDom();
  showToast(`Removed ${symbol} from watchlist`, 'success');
};
