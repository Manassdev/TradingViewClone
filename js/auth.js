/* Auth dialog validations, modal settings, and user session management */

window.handleLogout = function() {
  AppState.user = null;
  TradingApi.clearSession();
  AppState.watchlist = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT', 'XRPUSDT'];
  AppState.favorites = [];
  AppState.alerts = [];
  AppState.portfolio = { balance: 100000, holdings: [], transactions: [] };
  updateWatchlistDom();
  renderAlerts();
  renderPortfolio();
  updateHeaderUserDom();
  renderProfile();
  showToast('Logged out', 'success');
};

window.updateHeaderUserDom = function() {
  renderHeader();
};
