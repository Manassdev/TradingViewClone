/* Auth dialog validations, modal settings, and user session management */

window.handleLogout = function(showMessage = true) {
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
  if (showMessage) showToast('Logged out', 'success');
};

window.addEventListener('trading:auth-expired', () => {
  handleLogout(false);
  showToast('Your session expired. Please sign in again.', 'warning');
});

window.updateHeaderUserDom = function() {
  renderHeader();
};
