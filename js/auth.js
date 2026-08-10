/* Auth dialog validations, modal settings, and user session management */

let isRegisterMode = false;

window.openAuthModal = function() {
  const modal = document.getElementById('auth-modal-overlay');
  const err = document.getElementById('auth-form-error');
  if (modal) modal.style.display = 'flex';
  if (err) err.style.display = 'none';
  isRegisterMode = false;
  renderAuthModalText();
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal-overlay');
  if (modal) modal.style.display = 'none';
};

window.toggleAuthMode = function() {
  isRegisterMode = !isRegisterMode;
  renderAuthModalText();
};

window.renderAuthModalText = function() {
  const title = document.getElementById('auth-modal-title');
  const userGroup = document.getElementById('auth-username-group');
  const submitBtn = document.getElementById('auth-submit-button');
  const prompt = document.getElementById('auth-modal-switch-prompt');
  const link = document.getElementById('auth-modal-switch-link');

  if (!title) return;

  if (isRegisterMode) {
    title.innerText = 'Sign Up';
    if (userGroup) userGroup.style.display = 'block';
    if (submitBtn) submitBtn.innerText = 'Register';
    if (prompt) prompt.innerText = 'Already have an account?';
    if (link) link.innerText = 'Sign In';
  } else {
    title.innerText = 'Sign In';
    if (userGroup) userGroup.style.display = 'none';
    if (submitBtn) submitBtn.innerText = 'Sign In';
    if (prompt) prompt.innerText = "Don't have an account?";
    if (link) link.innerText = 'Sign Up';
  }
};

window.handleAuthSubmit = function(e) {
  e.preventDefault();
  const errorBox = document.getElementById('auth-form-error');
  if (errorBox) errorBox.style.display = 'none';

  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const userInput = document.getElementById('auth-username');

  const email = emailInput ? emailInput.value.trim() : '';
  const password = passInput ? passInput.value : '';
  const username = userInput ? userInput.value.trim() : '';

  if (isRegisterMode) {
    if (!username || !email || !password) {
      if (errorBox) {
        errorBox.innerText = 'Please enter all fields';
        errorBox.style.display = 'block';
      }
      return;
    }
    
    AppState.user = { username, email, password, avatar: 'user' };
    saveState();
    closeAuthModal();
    updateHeaderUserDom();
    renderProfile();
    showToast('Registered successfully!', 'success');
    
  } else {
    const isDemo = (email === 'demo' || email === 'demo@test.com') && password === 'demo123';
    const localAccount = AppState.user;
    const isLocal = localAccount && (email === localAccount.email || email === localAccount.username) && password === localAccount.password;

    if (isDemo) {
      AppState.user = { username: 'Demo User', email: 'demo@test.com', avatar: 'rocket' };
      saveState();
      closeAuthModal();
      updateHeaderUserDom();
      renderProfile();
      showToast('Logged in successfully!', 'success');
    } else if (isLocal) {
      closeAuthModal();
      updateHeaderUserDom();
      renderProfile();
      showToast('Logged in successfully!', 'success');
    } else {
      if (errorBox) {
        errorBox.innerText = 'Invalid credentials. Hint: use username "demo" and password "demo123"';
        errorBox.style.display = 'block';
      }
    }
  }
};

window.handleLogout = function() {
  AppState.user = null;
  localStorage.removeItem('tv_user');
  updateHeaderUserDom();
  renderProfile();
  showToast('Logged out', 'success');
};

window.updateHeaderUserDom = function() {
  const authGuest = document.getElementById('auth-section-guest');
  const authUser = document.getElementById('auth-section-user');
  const headerName = document.getElementById('header-username');
  const headerAvatar = document.getElementById('header-user-avatar');

  if (AppState.user) {
    if (authGuest) authGuest.style.display = 'none';
    if (authUser) authUser.style.display = 'flex';
    if (headerName) headerName.innerText = AppState.user.username;
    
    const avatar = AppState.user.avatar || 'user';
    if (headerAvatar) {
      headerAvatar.innerHTML = `<i data-lucide="${avatar}" class="text-green"></i>`;
    }
  } else {
    if (authGuest) authGuest.style.display = 'flex';
    if (authUser) authUser.style.display = 'none';
  }
  lucide.createIcons();
};
