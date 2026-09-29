/* Paper trading panel, holdings valuation, donut charts, and order processing */

window.setTradeSide = function(side) {
  AppState.tradeSide = side;
  const buyBtn = document.getElementById('trade-side-buy');
  const sellBtn = document.getElementById('trade-side-sell');
  const submitBtn = document.getElementById('place-order-button');

  if (buyBtn) buyBtn.classList.toggle('active', side === 'BUY');
  if (sellBtn) sellBtn.classList.toggle('active', side === 'SELL');
  if (submitBtn) {
    submitBtn.innerText = `PLACE ${side} ORDER`;
    submitBtn.className = `place-order-submit-btn ${side.toLowerCase()}`;
  }
};

window.setOrderType = function(type) {
  AppState.orderType = type;
  const mktBtn = document.getElementById('order-type-market');
  const lmtBtn = document.getElementById('order-type-limit');
  if (mktBtn) mktBtn.classList.toggle('active', type === 'MARKET');
  if (lmtBtn) lmtBtn.classList.toggle('active', type === 'LIMIT');

  const priceInput = document.getElementById('trade-order-price');
  const priceSuffix = document.getElementById('trade-price-suffix');

  if (type === 'MARKET') {
    if (priceInput) priceInput.disabled = true;
    if (priceSuffix) priceSuffix.innerText = 'MARKET';
    const live = AppState.livePrices[AppState.activeSymbol] || { price: 0 };
    if (priceInput) priceInput.value = live.price;
  } else {
    if (priceInput) priceInput.disabled = false;
    if (priceSuffix) priceSuffix.innerText = 'USD';
  }
  calculateOrderCost();
};

window.calculateOrderCost = function() {
  const qtyInput = document.getElementById('trade-order-qty');
  const priceInput = document.getElementById('trade-order-price');
  const totalSpan = document.getElementById('cost-total-amount');

  const qty = parseFloat(qtyInput?.value) || 0;
  const price = parseFloat(priceInput?.value) || 0;
  if (totalSpan) totalSpan.innerText = `$${(qty * price).toLocaleString(undefined, {minimumFractionDigits:2})}`;
};

window.handlePlaceOrder = async function() {
  const qtyInput = document.getElementById('trade-order-qty');
  const priceInput = document.getElementById('trade-order-price');
  const qty = parseFloat(qtyInput?.value) || 0;
  const price = parseFloat(priceInput?.value) || 0;

  if (qty <= 0 || price <= 0) {
    showToast('Please enter valid quantities & target rates', 'error');
    return;
  }

  if (!AppState.user) return showToast('Sign in to use paper trading', 'warning');
  const symbol = AppState.activeSymbol;
  const button = document.getElementById('place-order-button');
  if (button) button.disabled = true;
  try {
    const result = await TradingApi.placeOrder({ symbol, type: AppState.tradeSide, qty, price });
    AppState.portfolio = result.portfolio;
    AppState.portfolio.transactions = [result.transaction, ...AppState.portfolio.transactions];
    renderPortfolio();
    showToast(`${AppState.tradeSide === 'BUY' ? 'Bought' : 'Sold'} ${qty} ${symbol.replace('USDT','')} in paper trading`, 'success');
    confetti({ particleCount: 60, spread: 40, origin: { y: 0.8 } });
  } catch (error) {
    showToast(error.message || 'Paper order failed', 'error');
  } finally {
    if (button) button.disabled = false;
  }
};

window.renderPortfolio = function() {
  recalculateHoldingsValuation();
  renderHoldingsDom();
  renderTransactionsDom();
};

window.recalculateHoldingsValuation = function() {
  let holdingsTotal = 0;
  let originalTotal = 0;

  AppState.portfolio.holdings.forEach(h => {
    const live = AppState.livePrices[h.symbol] || { price: h.avgPrice };
    holdingsTotal += h.qty * live.price;
    originalTotal += h.qty * h.avgPrice;
  });

  const cash = AppState.portfolio.balance;
  const netAssetValue = cash + holdingsTotal;
  const profitLoss = netAssetValue - 100000.00;
  const returnPct = (profitLoss / 100000.00) * 100;

  const navVal = document.getElementById('portfolio-nav-value');
  if (navVal) navVal.innerText = `$${netAssetValue.toLocaleString(undefined, {minimumFractionDigits:2})}`;
  
  const totalRet = document.getElementById('portfolio-total-return');
  if (totalRet) {
    const isUp = returnPct >= 0;
    totalRet.className = `return-pill ${isUp ? 'positive' : 'negative'}`;
    totalRet.innerHTML = `
      <i data-lucide="${isUp ? 'trending-up' : 'trending-down'}"></i>
      <span>${isUp ? '+' : ''}${returnPct.toFixed(2)}%</span>
    `;
    lucide.createIcons();
  }

  const cashVal = document.getElementById('portfolio-cash-value');
  if (cashVal) cashVal.innerText = `$${cash.toLocaleString(undefined, {minimumFractionDigits:2})}`;

  const holdingsVal = document.getElementById('portfolio-holdings-value');
  if (holdingsVal) holdingsVal.innerText = `$${holdingsTotal.toLocaleString(undefined, {minimumFractionDigits:2})}`;
  
  const walletBalance = document.getElementById('trade-wallet-balance');
  if (walletBalance) walletBalance.innerText = `$${cash.toLocaleString(undefined, {minimumFractionDigits:2})}`;

  renderAllocationDonut(cash, holdingsTotal);
};

window.renderAllocationDonut = function(cash, holdingsTotal) {
  const svg = document.getElementById('portfolio-allocation-svg');
  const legend = document.getElementById('portfolio-allocation-legend');
  if (!svg) return;

  const total = cash + holdingsTotal;
  if (total === 0) return;

  const cashPct = (cash / total) * 100;
  const holdPct = (holdingsTotal / total) * 100;

  const circ = 251.2;

  svg.innerHTML = `
    <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.05)" stroke-width="8" fill="none" />
    <circle cx="50" cy="50" r="40" stroke="#00e5ff" stroke-width="8" fill="none" 
      stroke-dasharray="${circ}" stroke-dashoffset="${circ - (circ * cashPct) / 100}" 
      transform="rotate(-90 50 50)" />
    <circle cx="50" cy="50" r="40" stroke="#ffeb3b" stroke-width="8" fill="none" 
      stroke-dasharray="${circ}" stroke-dashoffset="${circ - (circ * holdPct) / 100}" 
      transform="rotate(${(cashPct * 3.6) - 90} 50 50)" />
    <text x="50" y="53" text-anchor="middle" fill="#fff" font-size="9px" font-weight="700">USD</text>
  `;

  legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-left">
        <div class="legend-dot" style="background:#00e5ff;"></div>
        <span>Cash Wallet</span>
      </div>
      <span class="val">${cashPct.toFixed(1)}%</span>
    </div>
    <div class="legend-item">
      <div class="legend-left">
        <div class="legend-dot" style="background:#ffeb3b;"></div>
        <span>Holdings</span>
      </div>
      <span class="val">${holdPct.toFixed(1)}%</span>
    </div>
  `;
};

window.renderHoldingsDom = function() {
  const container = document.getElementById('portfolio-holdings-list');
  if (!container) return;

  if (AppState.portfolio.holdings.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:15px 0; font-size:11px; color:var(--text-muted);">No open asset positions</div>`;
    return;
  }

  container.innerHTML = AppState.portfolio.holdings.map(h => {
    const live = AppState.livePrices[h.symbol] || { price: h.avgPrice };
    const valuation = h.qty * live.price;
    const cost = h.qty * h.avgPrice;
    const pl = valuation - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    const plClass = pl >= 0 ? 'text-green' : 'text-red';
    const cleanSym = h.symbol.replace('USDT','');

    return `
      <div class="holding-row">
        <div class="holding-details-left">
          <span class="holding-name">${cleanSym}</span>
          <span class="holding-qty">${h.qty.toFixed(4)} @ $${h.avgPrice.toFixed(2)}</span>
        </div>
        <div class="holding-details-right">
          <span class="holding-val">$${valuation.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
          <span class="holding-pl ${plClass}">${pl >= 0 ? '+' : ''}${plPct.toFixed(2)}%</span>
        </div>
      </div>
    `;
  }).join('');
};

window.renderTransactionsDom = function() {
  const container = document.getElementById('portfolio-transactions-list');
  if (!container) return;

  if (AppState.portfolio.transactions.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:15px 0; font-size:11px; color:var(--text-muted);">No transactions recorded</div>`;
    return;
  }

  container.innerHTML = AppState.portfolio.transactions.map(t => {
    const cleanSym = t.symbol.replace('USDT','');
    const sideClass = t.type.toLowerCase();
    return `
      <div class="tx-row">
        <div class="tx-left">
          <span class="tx-side-badge ${sideClass}">${t.type}</span>
          <strong>${cleanSym}</strong>
          <span>x ${t.qty.toFixed(3)}</span>
        </div>
        <div class="tx-right">
          <span>@ $${t.price.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
          <span style="font-size:9px; margin-left:6px;">(${t.time})</span>
        </div>
      </div>
    `;
  }).join('');
};
