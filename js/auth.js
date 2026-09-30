/* Auth dialog validations, modal settings, and user session management */

window.handleLogout = async function() {
  AppState.user = null;
  if (window.ApiClient) await window.ApiClient.auth.logout();
  localStorage.removeItem('tv_user');
  updateHeaderUserDom();
  renderProfile();
  showToast('Logged out', 'success');
};

window.updateHeaderUserDom = function() {
  renderHeader();
};
