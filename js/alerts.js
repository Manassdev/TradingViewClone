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
        <button class="alert-delete-btn" onclick="window.AppModule.handleDeleteAlert('${a.id}')">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
        </button>
      </div>
    </div>
  `).join('');
  lucide.createIcons();
};

window.handleCreateAlert = async function() {
  const targetInput = document.getElementById('alert-form-target');
  const targetVal = parseFloat(targetInput?.value) || 0;
  const cond = document.getElementById('alert-form-condition').value;
  const symbol = AppState.activeSymbol;

  if (targetVal <= 0) {
    showToast('Please enter a valid price threshold', 'error');
    return;
  }

  if (!AppState.user) return showToast('Sign in to create alerts', 'warning');
  const submit = document.querySelector('.create-alert-btn');
  if (submit) { submit.disabled = true; submit.dataset.originalText = submit.innerText; submit.innerText = 'Creating…'; }
  try {
    const { alert } = await TradingApi.createAlert({ symbol, condition: cond, target: targetVal });
    AppState.alerts.push({ id: alert._id, symbol: alert.symbol, condition: alert.condition, target: alert.target, active: true });
    renderAlerts();
    if (targetInput) targetInput.value = '';
    showToast('Target alert created successfully', 'success');
  } catch (error) { showToast(error.message, 'error'); }
  finally { if (submit) { submit.disabled = false; submit.innerText = submit.dataset.originalText || 'Create Alert Trigger'; } }
};

window.handleDeleteAlert = async function(id) {
  if (!AppState.user) return showToast('Sign in to manage alerts', 'warning');
  try {
    await TradingApi.deleteAlert(id);
    AppState.alerts = AppState.alerts.filter(a => a.id !== id);
    renderAlerts();
    showToast('Alert deactivated', 'success');
  } catch (error) { showToast(error.message, 'error'); }
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
        if (AppState.user) TradingApi.deleteAlert(a.id).catch((error) => console.error('Alert sync failed:', error));
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
