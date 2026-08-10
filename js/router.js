/* Client-side single page hash routing module */

window.handleRouting = function() {
  const hash = window.location.hash || '#/home';
  const ctaBtn = document.getElementById('header-chart-cta-btn');
  const marketsMenu = document.getElementById('markets-dropdown-menu');
  if (marketsMenu) marketsMenu.style.display = 'none';

  if (hash.startsWith('#/chart')) {
    AppState.activeView = 'chart';
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('view-markets-crypto').style.display = 'none';
    document.getElementById('view-chart').style.display = 'flex';
    if (ctaBtn) ctaBtn.style.display = 'none';

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

    renderCryptoOverviewData();
  }
  else {
    AppState.activeView = 'home';
    document.getElementById('view-home').style.display = 'flex';
    document.getElementById('view-markets-crypto').style.display = 'none';
    document.getElementById('view-chart').style.display = 'none';
    if (ctaBtn) ctaBtn.style.display = 'inline-flex';

    renderOverviewTable();
  }
  renderProfile();
};
