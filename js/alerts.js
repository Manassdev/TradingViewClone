/* Backend-owned alerts and persistent notification UI. */

let backendNotifications = [];

const formatAlertCondition = (condition) => ({
  greater_than: 'at or above', above: 'at or above',
  less_than: 'at or below', below: 'at or below',
  crosses_up: 'crosses up', crosses_down: 'crosses down'
}[condition] || condition);

const formatNotificationAge = (createdAt) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

window.renderAlerts = function() {
  const list = document.getElementById('active-alerts-list');
  if (!list) return;
  list.replaceChildren();
  if (!window.ApiClient?.getToken()) {
    const note = document.createElement('p');
    note.className = 'alert-empty-state';
    note.textContent = 'Sign in to create and manage price alerts.';
    list.appendChild(note);
    return;
  }
  const alerts = Array.isArray(AppState.alerts) ? AppState.alerts.filter((item) => item.isActive) : [];
  if (!alerts.length) {
    const note = document.createElement('p');
    note.className = 'alert-empty-state';
    note.textContent = 'No price alerts yet.';
    list.appendChild(note);
    return;
  }

  for (const alert of alerts) {
    const row = document.createElement('div');
    row.className = 'alert-row';
    const details = document.createElement('div');
    details.className = 'alert-details';
    const symbol = document.createElement('strong');
    symbol.textContent = alert.symbol;
    const description = document.createElement('span');
    description.textContent = `${formatAlertCondition(alert.triggerCondition)} ${Number(alert.targetValue).toLocaleString()}${alert.isTriggered ? ' · Triggered' : ''}`;
    details.append(symbol, description);
    if (alert.monitoringAvailable === false || alert.provider === 'unavailable') {
      const unavailable = document.createElement('small');
      unavailable.className = 'alert-provider-note';
      unavailable.textContent = 'Stock monitoring unavailable until a live provider is configured.';
      details.appendChild(unavailable);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'alert-delete-btn';
    remove.textContent = 'Cancel';
    remove.setAttribute('aria-label', `Cancel ${alert.symbol} price alert`);
    remove.addEventListener('click', () => window.handleDeleteAlert(alert._id));
    row.append(details, remove);
    list.appendChild(row);
  }
};

window.renderNotifications = function() {
  const list = document.getElementById('notifications-list');
  const count = document.getElementById('notifications-unread-count');
  if (!list) return;
  list.replaceChildren();
  const unread = backendNotifications.filter((item) => !item.isRead).length;
  if (count) count.textContent = unread ? `${unread} unread` : '';
  if (!window.ApiClient?.getToken()) {
    const note = document.createElement('p');
    note.className = 'alert-empty-state';
    note.textContent = 'Sign in to view notifications.';
    list.appendChild(note);
    return;
  }
  if (!backendNotifications.length) {
    const note = document.createElement('p');
    note.className = 'alert-empty-state';
    note.textContent = 'No notifications yet.';
    list.appendChild(note);
    return;
  }
  for (const notification of backendNotifications) {
    const item = document.createElement('article');
    item.className = `notification-item${notification.isRead ? '' : ' unread'}`;
    const title = document.createElement('strong');
    title.textContent = notification.title;
    const message = document.createElement('p');
    message.textContent = notification.message;
    const age = document.createElement('small');
    age.textContent = formatNotificationAge(notification.createdAt);
    item.append(title, message, age);
    if (!notification.isRead) {
      const markRead = document.createElement('button');
      markRead.type = 'button';
      markRead.textContent = 'Mark read';
      markRead.addEventListener('click', () => window.markNotificationRead(notification._id));
      item.appendChild(markRead);
    }
    list.appendChild(item);
  }
};

window.handleCreateAlert = async function() {
  if (!window.ApiClient?.getToken()) {
    showToast('Sign in to create price alerts.', 'error');
    return;
  }
  const targetInput = document.getElementById('alert-form-target');
  const symbol = String(AppState.activeSymbol || '').trim().toUpperCase();
  const symbolInput = document.getElementById('alert-form-symbol');
  if (symbolInput) symbolInput.value = symbol;
  const targetValue = Number(targetInput?.value);
  const selectedCondition = document.getElementById('alert-form-condition')?.value;
  if (!symbol || !Number.isFinite(targetValue) || targetValue <= 0) {
    showToast('Please enter a valid positive target price.', 'error');
    return;
  }
  const assetType = symbol.endsWith('USDT') ? 'crypto' : 'stock';
  const response = await window.ApiClient.alerts.create({
    symbol,
    assetType,
    exchange: assetType === 'crypto' ? 'BINANCE' : 'NSE',
    condition: selectedCondition === 'below' ? 'less_than' : 'greater_than',
    targetValue
  });
  if (!response.ok || !response.data?.data) {
    showToast(response.data?.message || 'Could not create the alert.', 'error');
    return;
  }
  AppState.alerts.unshift(response.data.data);
  if (targetInput) targetInput.value = '';
  renderAlerts();
  showToast(assetType === 'stock' ? 'Alert saved. Stock monitoring is unavailable until a live provider is configured.' : 'Price alert created.', 'success');
};

window.handleDeleteAlert = async function(id) {
  if (!id || !window.ApiClient?.getToken()) return;
  const response = await window.ApiClient.alerts.delete(id);
  if (!response.ok) {
    showToast(response.data?.message || 'Could not cancel the alert.', 'error');
    return;
  }
  AppState.alerts = AppState.alerts.filter((item) => String(item._id) !== String(id));
  renderAlerts();
  showToast('Alert cancelled.', 'success');
};

window.syncAlertsFromBackend = async function() {
  if (!window.ApiClient?.getToken()) {
    AppState.alerts = [];
    backendNotifications = [];
    renderAlerts();
    renderNotifications();
    return;
  }
  const [alertResponse, notificationResponse] = await Promise.all([
    window.ApiClient.alerts.get(),
    window.ApiClient.notifications.get()
  ]);
  if (alertResponse.ok && Array.isArray(alertResponse.data?.data)) AppState.alerts = alertResponse.data.data;
  if (notificationResponse.ok && Array.isArray(notificationResponse.data?.data)) backendNotifications = notificationResponse.data.data;
  renderAlerts();
  renderNotifications();
};

window.markNotificationRead = async function(id) {
  const response = await window.ApiClient.notifications.markRead(id);
  if (!response.ok) {
    showToast(response.data?.message || 'Could not update the notification.', 'error');
    return;
  }
  const item = backendNotifications.find((notification) => notification._id === id);
  if (item) item.isRead = true;
  renderNotifications();
};

window.markAllNotificationsRead = async function() {
  const response = await window.ApiClient.notifications.markAllRead();
  if (!response.ok) {
    showToast(response.data?.message || 'Could not update notifications.', 'error');
    return;
  }
  backendNotifications = backendNotifications.map((item) => ({ ...item, isRead: true }));
  renderNotifications();
};

window.setInterval(() => {
  if (!window.ApiClient?.getToken()) return;
  Promise.all([window.ApiClient.alerts.get(), window.ApiClient.notifications.get()]).then(([alertsResponse, notificationsResponse]) => {
    if (alertsResponse.ok && Array.isArray(alertsResponse.data?.data)) {
      AppState.alerts = alertsResponse.data.data;
      renderAlerts();
    }
    if (notificationsResponse.ok && Array.isArray(notificationsResponse.data?.data)) {
      backendNotifications = notificationsResponse.data.data;
      renderNotifications();
    }
  });
}, 30_000);

// Kept as a compatibility hook for older callers; browser ticks are never authoritative.
window.checkPriceAlerts = function() {};
