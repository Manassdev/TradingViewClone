/* Auth dialog validations, modal settings, and user session management */

window.handleLogout = function() {
  AppState.user = null;
  localStorage.removeItem('tv_user');
  updateHeaderUserDom();
  renderProfile();
  showToast('Logged out', 'success');
};

window.updateHeaderUserDom = function() {
  renderHeader();
};
