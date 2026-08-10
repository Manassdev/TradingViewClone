/* Real-time price cross alarm checks, alert creations and triggers */

window.renderAlerts = function() {
  const list = document.getElementById('active-alerts-list');
  if (!list) return;

  if (AppState.alerts.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:20px 0; font-size:11px; color:var(--text-muted);">No active target price alerts set</div>`;
    return;
  }

  list.innerHTML = AppState.alerts.map(a => `
    <div class="alert-row">
      <div class="alert-details">
        <span class="symbol">${a.symbol}</span>
        <span class="desc">Crosses ${a.condition.toUpperCase()} $${a.target.toLocaleString(undefined, {minimumFractionDigits:2})}</span>
      </div>
      <div class="alert-right">
        <button class="alert-delete-btn" onclick="window.AppModule.handleDeleteAlert(${a.id})">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
};

window.handleCreateAlert = function() {
  const targetInput = document.getElementById('alert-form-target');
  const targetVal = parseFloat(targetInput?.value) || 0;
  const cond = document.getElementById('alert-form-condition').value;
  const symbol = AppState.activeSymbol;

  if (targetVal <= 0) {
    showToast('Please enter a valid price threshold', 'error');
    return;
  }

  AppState.alerts.push({
    id: Date.now(),
    symbol,
    condition: cond,
    target: targetVal,
    active: true
  });

  saveState();
  renderAlerts();
  if (targetInput) targetInput.value = '';
  showToast('Target alert created successfully', 'success');
};

window.handleDeleteAlert = function(id) {
  AppState.alerts = AppState.alerts.filter(a => a.id !== id);
  saveState();
  renderAlerts();
  showToast('Alert deactivated', 'success');
};

window.checkPriceAlerts = function(symbol, currentPrice) {
  AppState.alerts.forEach(a => {
    if (a.symbol === symbol && a.active) {
      let triggered = false;
      if (a.condition === 'above' && currentPrice >= a.target) triggered = true;
      if (a.condition === 'below' && currentPrice <= a.target) triggered = true;

      if (triggered) {
        a.active = false;
        AppState.alerts = AppState.alerts.filter(al => al.id !== a.id);
        saveState();
        renderAlerts();
        triggerAlertPopup(a.symbol, a.condition, a.target);
      }
    }
  });
};

window.triggerAlertPopup = function(symbol, cond, target) {
  showToast(`ALERT CROSS: ${symbol} has crossed ${cond.toUpperCase()} target of $${target}!`, 'warning');
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  } catch(e){}

  confetti({ particleCount: 80, spread: 60, colors: ['#ffb700', '#ffffff', '#2962ff'] });
};
