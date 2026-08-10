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
  AppState.user.avatar = avatarName;
  saveState();
  renderProfile();
  
  // Update header avatar as well
  const authGuest = document.getElementById('auth-section-guest');
  const authUser = document.getElementById('auth-section-user');
  const headerName = document.getElementById('header-username');
  const headerAvatar = document.getElementById('header-user-avatar');

  if (AppState.user) {
    if (authGuest) authGuest.style.display = 'none';
    if (authUser) authUser.style.display = 'flex';
    if (headerName) headerName.innerText = AppState.user.username;
    if (headerAvatar) {
      headerAvatar.innerHTML = `<i data-lucide="${avatarName}" class="text-green"></i>`;
    }
  }
  
  lucide.createIcons();
  showToast('Avatar profile updated', 'success');
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
  const input = document.getElementById('profile-new-password');
  const pwd = input ? input.value : '';
  if (!pwd || pwd.length < 6) {
    showToast('Password must be 6 characters or longer', 'error');
    return;
  }

  AppState.user.password = pwd;
  saveState();
  if (input) input.value = '';
  showToast('Password updated successfully', 'success');
};
