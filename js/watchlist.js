/* Watchlist rendering and server/local data flow */

const getWatchlistItem = (symbol) => AppState.watchlistItems.find((item) => item.symbol === symbol);
const inferAssetType = (symbol) => symbol.endsWith('USDT') ? 'crypto' : 'stock';

const refreshWatchlistStream = () => {
  if (typeof window.initTickerStream === 'function') window.initTickerStream();
};

window.renderWatchlist = function() {
  updateWatchlistDom();
};

window.updateWatchlistDom = function() {
  const list = document.getElementById('watchlist-items-list');
  if (!list) return;

  let items = AppState.watchlist;
  if (AppState.watchlistFilter === 'favorites') {
    items = items.filter((symbol) => AppState.favorites.includes(symbol));
  }

  let html = '';
  items.forEach((symbol) => {
    const item = getWatchlistItem(symbol);
    const assetType = item?.assetType || inferAssetType(symbol);
    const data = AppState.livePrices[symbol] || { price: null, change: null, flash: '' };
    const hasPrice = assetType === 'crypto' && Number.isFinite(data.price) && data.price > 0;
    const isUp = parseFloat(data.change) >= 0;
    const changeClass = isUp ? 'text-green' : 'text-red';
    const cleanName = assetType === 'crypto' ? symbol.replace('USDT', '') : symbol;
    const isStarred = AppState.favorites.includes(symbol);
    const starredClass = isStarred ? 'starred' : '';
    const activeClass = AppState.activeSymbol === symbol ? 'active' : '';
    const assetLabel = assetType === 'crypto' ? 'Crypto / USDT' : `Stock / ${item?.exchange || 'NSE'}`;
    const priceLabel = hasPrice
      ? `$${data.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      : '—';
    const changeLabel = hasPrice ? `${isUp ? '+' : ''}${data.change}%` : '—';

    html += `
      <div class="watchlist-item ${activeClass}" onclick="window.AppModule.selectSymbol('${symbol}')">
        <div class="watchlist-item-left">
          <span class="watchlist-item-name">${cleanName}</span>
          <span class="watchlist-item-desc">${assetLabel}</span>
        </div>
        <div class="watchlist-item-right">
          <div class="watchlist-item-price-block">
            <span class="watchlist-item-price ${data.flash}">${priceLabel}</span>
            <span class="watchlist-item-change ${changeClass}">${changeLabel}</span>
          </div>
          <button class="watchlist-star-btn ${starredClass}"
            onclick="event.stopPropagation(); window.AppModule.toggleFavorite('${symbol}')"
            title="Add to Favorites">
            <i data-lucide="star" style="width:14px; height:14px;"></i>
          </button>
          <button class="watchlist-remove-btn"
            onclick="event.stopPropagation(); window.AppModule.handleRemoveFromWatchlist('${symbol}')"
            title="Remove Ticker">
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
  if (tradeSymbol) tradeSymbol.innerText = symbol.replace('USDT', '');

  updateWatchlistDom();
  renderDetails();

  if (ChartEngine.loadData) {
    ChartEngine.loadData(symbol, AppState.activeTimeframe);
  }
};

window.toggleFavorite = function(symbol) {
  const index = AppState.favorites.indexOf(symbol);
  if (index >= 0) AppState.favorites.splice(index, 1);
  else AppState.favorites.push(symbol);
  saveState();
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
  const matches = AppState.assetList.filter((asset) =>
    asset.symbol.includes(query) || asset.name.toUpperCase().includes(query)
  );

  if (matches.length > 0) {
    box.style.display = 'block';
    box.innerHTML = matches.map((asset) => `
      <div onclick="window.AppModule.handleSuggestionClick('${asset.symbol}')">
        <strong>${asset.symbol.replace('USDT', '')}</strong> - ${asset.name}
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
  addSymbolToWatchlist(symbol, 'crypto');
};

window.handleAddToWatchlist = async function(event) {
  event.preventDefault();
  const input = document.getElementById('watchlist-search-input');
  const value = input.value.trim();
  if (!value) return;

  const query = value.toUpperCase();
  const cryptoMatch = AppState.assetList.find((asset) =>
    asset.symbol === query || asset.symbol.replace('USDT', '') === query || asset.name.toUpperCase() === query
  );
  const symbol = cryptoMatch ? cryptoMatch.symbol : query;
  const assetType = cryptoMatch || query.endsWith('USDT') ? 'crypto' : 'stock';

  const added = await addSymbolToWatchlist(symbol, assetType);
  if (!added) return;
  input.value = '';
  document.getElementById('search-suggestions-box').style.display = 'none';
};

window.addSymbolToWatchlist = async function(rawSymbol, assetType = inferAssetType(rawSymbol)) {
  const symbol = String(rawSymbol).trim().toUpperCase();
  const exchange = assetType === 'crypto' ? 'BINANCE' : 'NSE';
  const authenticated = window.ApiClient && window.ApiClient.getToken();
  if (authenticated && window.watchlistSyncPromise) await window.watchlistSyncPromise;
  const existing = AppState.watchlistItems.find((item) => item.symbol === symbol && item.assetType === assetType);
  if (existing || AppState.watchlist.includes(symbol)) {
    showToast('Ticker already in watchlist', 'warning');
    return false;
  }

  if (authenticated) {
    const response = await window.ApiClient.watchlist.add({
      symbol,
      assetType,
      exchange,
      provider: assetType === 'crypto' ? 'binance' : 'manual'
    });
    if (!response.ok || !response.data?.data) {
      showToast(response.data?.message || 'Could not save the watchlist item', 'error');
      return false;
    }
    const item = response.data.data;
    AppState.watchlistItems.push(item);
    AppState.watchlist.push(item.symbol);
  } else {
    const item = { _id: `local:${assetType}:${symbol}`, symbol, assetType, exchange, provider: assetType === 'crypto' ? 'binance' : 'manual' };
    AppState.watchlistItems.push(item);
    AppState.watchlist.push(symbol);
    saveState();
  }

  updateWatchlistDom();
  refreshWatchlistStream();
  showToast(`Added ${symbol} to watchlist`, 'success');
  return true;
};

window.handleRemoveFromWatchlist = async function(symbol) {
  const item = getWatchlistItem(symbol);
  const authenticated = window.ApiClient && window.ApiClient.getToken();
  if (authenticated) {
    if (!item?._id) {
      showToast('Watchlist is still loading. Please try again.', 'warning');
      return false;
    }
    const response = await window.ApiClient.watchlist.remove(item._id);
    if (!response.ok) {
      showToast(response.data?.message || 'Could not remove the watchlist item', 'error');
      return false;
    }
  }

  AppState.watchlist = AppState.watchlist.filter((entry) => entry !== symbol);
  AppState.watchlistItems = AppState.watchlistItems.filter((entry) => entry.symbol !== symbol);
  saveState();
  updateWatchlistDom();
  refreshWatchlistStream();
  showToast(`Removed ${symbol} from watchlist`, 'success');
  return true;
};

// Authenticated users always replace any local snapshot with the server result.
window.syncWatchlistFromBackend = async function() {
  if (!(window.ApiClient && window.ApiClient.getToken())) return;

  const response = await window.ApiClient.watchlist.get();
  if (!response.ok || !Array.isArray(response.data?.data?.items)) {
    AppState.watchlist = [];
    AppState.watchlistItems = [];
    updateWatchlistDom();
    showToast(response.data?.message || 'Could not load your watchlist', 'error');
    return;
  }

  AppState.watchlistItems = response.data.data.items;
  AppState.watchlist = AppState.watchlistItems.map((item) => item.symbol);
  updateWatchlistDom();
  refreshWatchlistStream();
};
