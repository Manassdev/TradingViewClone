/* Profile rendering, user avatar customization, password modifications and theme settings */

window.renderProfile = function() {
  const bannerUsername = document.getElementById('profile-username-display');
  const bannerEmail = document.getElementById('profile-email-display');
  const pwForm = document.getElementById('profile-password-form');
  
  if (!bannerUsername) return;

  document.querySelectorAll('.avatar-select-grid .avatar-option').forEach(opt => {
    const av = opt.getAttribute('data-avatar');
    opt.classList.toggle('active', AppState.user && AppState.user.avatar === av);
  });

  if (AppState.user) {
    bannerUsername.innerText = AppState.user.username;
    bannerEmail.innerText = AppState.user.email;
    if (pwForm) pwForm.style.display = 'block';

    const avatar = AppState.user.avatar || 'user';
    const displayAvatar = document.getElementById('profile-avatar-display');
    if (displayAvatar) {
      displayAvatar.innerHTML = `<i data-lucide="${avatar}"></i>`;
    }
  } else {
    bannerUsername.innerText = 'Guest User';
    bannerEmail.innerText = 'Sign in to customize charts';
    if (pwForm) pwForm.style.display = 'none';
    const displayAvatar = document.getElementById('profile-avatar-display');
    if (displayAvatar) {
      displayAvatar.innerHTML = `<i data-lucide="user"></i>`;
    }
  }

  const darkChip = document.getElementById('theme-dark-chip');
  const lightChip = document.getElementById('theme-light-chip');
  if (darkChip) darkChip.classList.toggle('active', AppState.theme === 'dark');
  if (lightChip) lightChip.classList.toggle('active', AppState.theme === 'light');
  
  lucide.createIcons();
};

window.changeAvatar = function(avatarName) {
  if (!AppState.user) {
    showToast('Please sign in to select an avatar', 'warning');
    return;
  }
  TradingApi.updateProfile({ avatar: avatarName }).then(({ user }) => {
    AppState.user = user;
    renderProfile();
    renderHeader();
    showToast('Avatar profile updated', 'success');
  }).catch((error) => showToast(error.message, 'error'));
};

window.setTheme = function(theme) {
  AppState.theme = theme;
  document.body.className = theme === 'light' ? 'light-theme' : '';
  localStorage.setItem('tv_theme', theme);
  renderProfile();

  if (ChartEngine && ChartEngine.setTheme) {
    ChartEngine.setTheme(theme);
  }
};

window.setPrefTimeframe = function(tf) {
  AppState.activeTimeframe = tf;
  const selectors = document.getElementById('pref-timeframe');
  if (selectors) selectors.value = tf;
  
  renderTimeframes();
  if (ChartEngine && ChartEngine.loadData) {
    ChartEngine.loadData(AppState.activeSymbol, tf);
  }
  showToast(`Default chart options set to ${tf}`, 'success');
};

window.updatePassword = function() {
  const currentInput = document.getElementById('profile-current-password');
  const input = document.getElementById('profile-new-password');
  const currentPassword = currentInput ? currentInput.value : '';
  const newPassword = input ? input.value : '';
  if (!currentPassword || newPassword.length < 8) {
    showToast('Enter your current password and a new password of at least 8 characters', 'error');
    return;
  }
  TradingApi.updatePassword({ currentPassword, newPassword }).then(() => {
    if (currentInput) currentInput.value = '';
    if (input) input.value = '';
    showToast('Password updated successfully', 'success');
  }).catch((error) => showToast(error.message, 'error'));
};
