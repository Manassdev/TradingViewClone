/* Client-side single page hash routing module */

window.handleRouting = function() {
  const hash = window.location.hash || '#/home';
  const ctaBtn = document.getElementById('header-chart-cta-btn');
  const marketsMenu = document.getElementById('markets-dropdown-menu');
  const header = document.querySelector('.app-header');
  if (marketsMenu) marketsMenu.style.display = 'none';

  const viewHome = document.getElementById('view-home');
  const viewMarketsCrypto = document.getElementById('view-markets-crypto');
  const viewChart = document.getElementById('view-chart');

  if (!viewHome || !viewMarketsCrypto || !viewChart) {
    // Standalone page context (like pricing.html). Skip view toggling.
    renderProfile();
    return;
  }

  if (hash.startsWith('#/chart')) {
    AppState.activeView = 'chart';
    viewHome.style.display = 'none';
    viewMarketsCrypto.style.display = 'none';
    viewChart.style.display = 'flex';
    if (ctaBtn) ctaBtn.style.display = 'none';

    // Reset scrolled state for dark chart workspace view
    if (header) {
      header.classList.remove('scrolled');
      header.classList.remove('header-on-white');
    }

    const urlParams = new URLSearchParams(hash.split('?')[1]);
    const sym = urlParams.get('symbol');
    if (sym && sym !== AppState.activeSymbol) {
      selectSymbol(sym);
    }
  } 
  else if (hash.startsWith('#/markets/crypto')) {
    AppState.activeView = 'markets-crypto';
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('view-markets-crypto').style.display = 'flex';
    document.getElementById('view-chart').style.display = 'none';
    if (ctaBtn) ctaBtn.style.display = 'inline-flex';

    // Always enforce scrolled classes (dark text) over light markets content
    if (header) {
      header.classList.add('scrolled');
      header.classList.add('header-on-white');
    }

    renderCryptoOverviewData();
  }
  else {
    AppState.activeView = 'home';
    document.getElementById('view-home').style.display = 'flex';
    document.getElementById('view-markets-crypto').style.display = 'none';
    document.getElementById('view-chart').style.display = 'none';
    if (ctaBtn) ctaBtn.style.display = 'inline-flex';

    // Query homepage scroll coordinates to set initial scrolled class state
    const homeView = document.getElementById('view-home');
    const heroSection = document.querySelector('.hero-section');
    if (header && homeView && heroSection) {
      const rect = heroSection.getBoundingClientRect();
      if (rect.bottom <= 64) {
        header.classList.add('scrolled');
        header.classList.add('header-on-white');
      } else {
        header.classList.remove('scrolled');
        header.classList.remove('header-on-white');
      }
    }

    renderOverviewTable();
  }
  renderProfile();
};
