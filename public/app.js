const apiBase = document.documentElement.dataset.apiBase || '/api/v1';
const BROWSER_NOTIFICATION_PREFS_KEY = 'projet-e6-browser-notifications';

const state = {
  history: [],
  thresholds: {},
  actuators: {},
  alerts: [],
  logs: [],
  notifications: null,
  automation: null,
  system: null,
  device: null,
  auth: { role: 'visitor' },
  sseConnected: false,
};

const dom = {
  metricNodes: [...document.querySelectorAll('[data-metric]')],
  metricCards: [...document.querySelectorAll('[data-metric-card]')],
  lastUpdate: document.querySelector('[data-last-update]'),
  alertList: document.querySelector('[data-alert-list]'),
  history: document.querySelector('[data-history-table]'),
  logs: document.querySelector('[data-log-list]'),
  thresholdForm: document.querySelector('[data-threshold-form]'),
  thresholdStatus: document.querySelector('[data-threshold-status]'),
  exportBtn: document.querySelector('[data-export]'),
  refreshBtn: document.querySelector('[data-refresh]'),
  apiStatus: document.querySelector('[data-api-status]'),
  connection: document.querySelector('[data-connection]'),
  systemBackend: document.querySelector('[data-system-backend]'),
  systemEngine: document.querySelector('[data-system-engine]'),
  systemStatus: document.querySelector('[data-system-status]'),
  systemMessage: document.querySelector('[data-system-message]'),
  deviceStatus: document.querySelector('[data-device-status]'),
  deviceLastSeen: document.querySelector('[data-device-lastseen]'),
  deviceIp: document.querySelector('[data-device-ip]'),
  deviceRssi: document.querySelector('[data-device-rssi]'),
  opsDevice: document.querySelector('[data-ops-device]'),
  opsPump: document.querySelector('[data-ops-pump]'),
  opsAlerts: document.querySelector('[data-ops-alerts]'),
  opsMail: document.querySelector('[data-ops-mail]'),
  opsAutomation: document.querySelector('[data-ops-automation]'),
  alertSummary: document.querySelector('[data-alert-summary]'),
  commandStatus: document.querySelector('[data-command-status]'),
  browserEnabled: document.querySelector('[data-browser-enabled]'),
  browserCriticalOnly: document.querySelector('[data-browser-critical-only]'),
  browserPermission: document.querySelector('[data-browser-permission]'),
  browserStatus: document.querySelector('[data-browser-status]'),
  emailForm: document.querySelector('[data-email-form]'),
  emailStatus: document.querySelector('[data-email-status]'),
  emailTest: document.querySelector('[data-email-test]'),
  automationForm: document.querySelector('[data-automation-form]'),
  automationStatus: document.querySelector('[data-automation-status]'),
  automationSummary: document.querySelector('[data-automation-summary]'),
  authStatus: document.querySelector('[data-auth-status]'),
  authOpen: document.querySelector('[data-auth-open]'),
  authLogout: document.querySelector('[data-auth-logout]'),
  authModal: document.querySelector('[data-auth-modal]'),
  authClose: document.querySelector('[data-auth-close]'),
  authForm: document.querySelector('[data-auth-form]'),
  authError: document.querySelector('[data-auth-error]'),
  adminSection: document.querySelector('[data-admin-section]'),
  adminLink: document.querySelector('[data-admin-link]'),
  adminRole: document.querySelector('[data-admin-role]'),
  adminAccess: document.querySelector('[data-admin-access]'),
  adminUser: document.querySelector('[data-admin-user]'),
};

const actuatorNodes = {
  pump: {
    state: document.querySelector('[data-actuator-state="pump"]'),
    toggle: document.querySelector('[data-toggle="pump"]'),
    mode: document.querySelector('[data-mode="pump"]'),
  },
  heater: {
    state: document.querySelector('[data-actuator-state="heater"]'),
    toggle: document.querySelector('[data-toggle="heater"]'),
    mode: document.querySelector('[data-mode="heater"]'),
  },
};

let eventSource = null;
const pendingActuators = new Set();
const seenAlertIds = new Set();
const browserNotificationPrefs = loadBrowserNotificationPrefs();

function loadBrowserNotificationPrefs() {
  try {
    const raw = window.localStorage.getItem(BROWSER_NOTIFICATION_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      enabled: parsed?.enabled !== undefined ? Boolean(parsed.enabled) : true,
      criticalOnly: parsed?.criticalOnly !== undefined ? Boolean(parsed.criticalOnly) : false,
    };
  } catch (error) {
    return {
      enabled: true,
      criticalOnly: false,
    };
  }
}

function saveBrowserNotificationPrefs() {
  try {
    window.localStorage.setItem(BROWSER_NOTIFICATION_PREFS_KEY, JSON.stringify(browserNotificationPrefs));
  } catch (error) {
    console.error(error);
  }
}

function toFixedValue(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return Number(value).toFixed(decimals);
}

function formatDate(value) {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('fr-FR');
}

function isAdmin() {
  return state.auth && state.auth.role === 'admin';
}

function isAuthenticated() {
  return Boolean(state.auth && state.auth.role && state.auth.role !== 'visitor');
}

function deviceCanReceiveCommands() {
  const mqttEnabled = Boolean(state.system?.mqtt?.enabled);
  return !mqttEnabled || Boolean(state.device?.online);
}

function setApiStatus(online, message) {
  if (!dom.apiStatus) {
    return;
  }
  dom.apiStatus.textContent = message;
  dom.apiStatus.classList.toggle('offline', !online);
}

function setCommandStatus(message, isError = false) {
  if (!dom.commandStatus) {
    return;
  }
  dom.commandStatus.textContent = message;
  dom.commandStatus.classList.toggle('bad', isError);
}

function getNotificationPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function renderBrowserNotificationControls() {
  const permission = getNotificationPermission();
  if (dom.browserEnabled) {
    dom.browserEnabled.checked = browserNotificationPrefs.enabled;
  }
  if (dom.browserCriticalOnly) {
    dom.browserCriticalOnly.checked = browserNotificationPrefs.criticalOnly;
  }
  if (dom.browserPermission) {
    dom.browserPermission.disabled = permission === 'unsupported' || permission === 'granted';
  }
  if (dom.browserStatus) {
    const labels = {
      granted: 'Permission: autorisee',
      denied: 'Permission: refusee',
      default: 'Permission: a demander',
      unsupported: 'Notifications web indisponibles sur ce navigateur',
    };
    dom.browserStatus.textContent = labels[permission] || permission;
  }
}

function maybeNotifyBrowserAlerts(alerts) {
  if (!browserNotificationPrefs.enabled || !('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  alerts
    .filter((alert) => !browserNotificationPrefs.criticalOnly || alert.severity === 'critical')
    .forEach((alert) => {
      const notification = new Notification('Projet E6 - Alerte bassin', {
        body: `${alert.message} (${formatDate(alert.timestamp)})`,
        tag: alert.id,
      });
      notification.onclick = () => window.focus();
    });
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function computeMetricStatus(value, threshold = {}) {
  const min = threshold.min;
  const max = threshold.max;

  if (min === undefined && max === undefined) {
    return 'ok';
  }
  if (min !== undefined && value < min) {
    return value < min * 0.9 ? 'critical' : 'warn';
  }
  if (max !== undefined && value > max) {
    return value > max * 1.1 ? 'critical' : 'warn';
  }
  return 'ok';
}

function updateMetricUI(metric) {
  if (!metric) {
    return;
  }

  dom.metricNodes.forEach((node) => {
    const key = node.dataset.metric;
    if (!key) {
      return;
    }
    const decimals = key === 'ph' ? 2 : 1;
    node.textContent = toFixedValue(metric[key], decimals);
  });

  if (dom.lastUpdate) {
    dom.lastUpdate.textContent = `Derniere mise a jour: ${formatDate(metric.timestamp)}`;
  }

  dom.metricCards.forEach((card) => {
    const key = card.dataset.metricCard;
    if (!key || metric[key] === undefined) {
      return;
    }
    const status = computeMetricStatus(metric[key], state.thresholds[key] || {});
    card.classList.remove('ok', 'warn', 'critical');
    card.classList.add(status);
  });
}

function setDisconnectedUI(reason) {
  dom.metricNodes.forEach((node) => {
    node.textContent = '--';
  });
  dom.metricCards.forEach((card) => {
    card.classList.remove('ok', 'warn', 'critical');
  });
  if (dom.lastUpdate) {
    dom.lastUpdate.textContent = reason;
  }
}

function setLockedUI() {
  setDisconnectedUI('Authentification requise pour consulter le bassin');
  if (dom.history) {
    dom.history.innerHTML = '<p class="form-hint">Connecte-toi pour consulter l historique des mesures.</p>';
  }
  if (dom.logs) {
    dom.logs.innerHTML = '<p class="form-hint">Connecte-toi pour consulter les journaux et alertes.</p>';
  }
  if (dom.alertList) {
    dom.alertList.innerHTML = '<p class="form-hint">Connecte-toi pour consulter les alertes du bassin.</p>';
  }
  if (dom.alertSummary) {
    dom.alertSummary.textContent = 'Session requise.';
  }
  setCommandStatus('Authentification requise avant toute commande.', true);
}

function updateThresholdForm() {
  if (!dom.thresholdForm) {
    return;
  }

  const { thresholds } = state;
  dom.thresholdForm.temperature_min.value = thresholds.temperature?.min ?? '';
  dom.thresholdForm.temperature_max.value = thresholds.temperature?.max ?? '';
  dom.thresholdForm.ph_min.value = thresholds.ph?.min ?? '';
  dom.thresholdForm.ph_max.value = thresholds.ph?.max ?? '';
  dom.thresholdForm.turbidity_max.value = thresholds.turbidity?.max ?? '';
  dom.thresholdForm.water_level_min.value = thresholds.water_level?.min ?? '';
  dom.thresholdForm.water_level_max.value = thresholds.water_level?.max ?? '';
  dom.thresholdForm.humidity_min.value = thresholds.humidity?.min ?? '';
  dom.thresholdForm.humidity_max.value = thresholds.humidity?.max ?? '';
}

function renderAlerts() {
  const activeCount = state.alerts.length;
  const criticalCount = state.alerts.filter((alert) => alert.severity === 'critical').length;

  if (dom.alertSummary) {
    dom.alertSummary.textContent = activeCount
      ? `${activeCount} alerte(s) actives, dont ${criticalCount} critique(s).`
      : 'Aucune alerte active.';
  }

  if (!dom.alertList) {
    return;
  }

  if (!state.alerts.length) {
    dom.alertList.innerHTML = '<p class="form-hint">Aucune alerte recente.</p>';
    return;
  }

  dom.alertList.innerHTML = state.alerts
    .slice()
    .reverse()
    .map((alert) => {
      const severityClass = alert.severity === 'critical' ? 'alert-item critical' : 'alert-item';
      return `
        <div class="${severityClass}">
          <div class="alert-title">${alert.message}</div>
          <div class="alert-meta">${formatDate(alert.timestamp)} | ${alert.type}</div>
        </div>
      `;
    })
    .join('');
}

function renderHistory() {
  if (!dom.history) {
    return;
  }

  if (!state.history.length) {
    dom.history.innerHTML = '<p class="form-hint">Historique vide.</p>';
    return;
  }

  const rows = state.history.slice(-12).reverse();
  const header = `
    <div class="history-row header">
      <div>Horodatage</div>
      <div>Temp</div>
      <div>pH</div>
      <div>Turb</div>
      <div>Niveau</div>
      <div>Hum</div>
    </div>
  `;

  const body = rows
    .map((item) => `
      <div class="history-row">
        <div>${formatDate(item.timestamp)}</div>
        <div>${toFixedValue(item.temperature, 1)}</div>
        <div>${toFixedValue(item.ph, 2)}</div>
        <div>${toFixedValue(item.turbidity, 1)}</div>
        <div>${toFixedValue(item.water_level, 1)}</div>
        <div>${toFixedValue(item.humidity, 1)}</div>
      </div>
    `)
    .join('');

  dom.history.innerHTML = header + body;
}

function renderLogs() {
  if (!dom.logs) {
    return;
  }

  if (!state.logs.length) {
    dom.logs.innerHTML = '<p class="form-hint">Aucun log pour le moment.</p>';
    return;
  }

  dom.logs.innerHTML = state.logs
    .slice()
    .reverse()
    .map((line) => `<div class="log-item">${line}</div>`)
    .join('');
}

function renderOpsStrip() {
  if (dom.opsDevice) {
    dom.opsDevice.textContent = state.device?.online ? 'ESP32 en ligne' : 'ESP32 hors ligne';
  }
  if (dom.opsPump) {
    dom.opsPump.textContent = state.actuators.pump?.state === 'on' ? 'Pompe en marche' : 'Pompe arretee';
  }
  if (dom.opsAlerts) {
    dom.opsAlerts.textContent = String(state.alerts.length);
  }
  if (dom.opsMail) {
    const emailSettings = state.notifications?.settings?.email;
    const hasEmail = Boolean(emailSettings?.enabled && emailSettings.to);
    const hasBrowser = browserNotificationPrefs.enabled;
    dom.opsMail.textContent = hasEmail && hasBrowser
      ? 'Email + navigateur'
      : hasEmail
        ? 'Email'
        : hasBrowser
          ? 'Notification web'
          : 'Aucun canal';
  }
  if (dom.opsAutomation) {
    dom.opsAutomation.textContent = state.automation?.settings?.enabled
      ? 'Regulation active'
      : 'Pilotage manuel';
  }
}

function renderEmailNotifications() {
  const snapshot = state.notifications;
  const emailSettings = snapshot?.settings?.email;
  const emailStatus = snapshot?.status;
  if (!dom.emailForm || !emailSettings) {
    return;
  }

  dom.emailForm.email_enabled.checked = Boolean(emailSettings.enabled);
  dom.emailForm.email_to.value = emailSettings.to || '';
  dom.emailForm.email_critical_only.checked = Boolean(emailSettings.criticalOnly);
  dom.emailForm.querySelectorAll('input, button').forEach((element) => {
    if (element === dom.emailTest) {
      element.disabled = !isAdmin() || !emailSettings.enabled || !emailStatus?.emailConfigured;
      return;
    }
    element.disabled = !isAdmin();
  });

  if (dom.emailStatus) {
    if (!isAdmin()) {
      dom.emailStatus.textContent = 'Connexion admin requise.';
    } else if (!emailStatus?.emailConfigured) {
      dom.emailStatus.textContent = 'SMTP non configure sur le serveur.';
    } else if (emailStatus?.lastEmailError) {
      dom.emailStatus.textContent = `Erreur email: ${emailStatus.lastEmailError}`;
    } else if (emailStatus?.lastEmailAt) {
      dom.emailStatus.textContent = `Dernier envoi: ${formatDate(emailStatus.lastEmailAt)}`;
    } else {
      dom.emailStatus.textContent = 'SMTP pret. Aucun email envoye pour le moment.';
    }
  }

  renderOpsStrip();
}

function renderAutomation() {
  const snapshot = state.automation;
  const settings = snapshot?.settings;
  const status = snapshot?.status;
  if (!settings) {
    return;
  }

  if (dom.automationForm) {
    dom.automationForm.automation_enabled.checked = Boolean(settings.enabled);
    dom.automationForm.manual_hold_minutes.value = settings.manualHoldMinutes ?? '';
    dom.automationForm.heater_enabled.checked = Boolean(settings.heater?.enabled);
    dom.automationForm.heater_min_temp.value = settings.heater?.minTemp ?? '';
    dom.automationForm.heater_max_temp.value = settings.heater?.maxTemp ?? '';
    dom.automationForm.pump_enabled.checked = Boolean(settings.pump?.enabled);
    dom.automationForm.pump_low_level_cutoff.value = settings.pump?.lowLevelCutoff ?? '';
    dom.automationForm.pump_turbidity_start.value = settings.pump?.turbidityStart ?? '';
    dom.automationForm.pump_turbidity_stop.value = settings.pump?.turbidityStop ?? '';
    dom.automationForm.pump_cycle_on_minutes.value = settings.pump?.cycleOnMinutes ?? '';
    dom.automationForm.pump_cycle_off_minutes.value = settings.pump?.cycleOffMinutes ?? '';
    dom.automationForm.querySelectorAll('input, button').forEach((element) => {
      element.disabled = !isAdmin();
    });
  }

  if (dom.automationSummary) {
    const holds = [];
    if (status?.holds?.pump?.active) {
      holds.push(`pompe jusqu'au ${formatDate(status.holds.pump.until)}`);
    }
    if (status?.holds?.heater?.active) {
      holds.push(`chauffage jusqu'au ${formatDate(status.holds.heater.until)}`);
    }
    const lastAction = status?.lastAction
      ? `Derniere action: ${status.lastAction.device} -> ${status.lastAction.state} (${status.lastAction.reason || 'regle'})`
      : 'Aucune action automatique recente.';
    dom.automationSummary.textContent = settings.enabled
      ? `Automatisation active. Chauffage ${settings.heater?.enabled ? 'regule' : 'ignore'}, pompe ${settings.pump?.enabled ? 'regulee' : 'ignoree'}. ${holds.length ? `Maintien manuel: ${holds.join(', ')}. ` : ''}${lastAction}`
      : 'Automatisation inactive. Les actionneurs restent en pilotage manuel via le dashboard ou le firmware.';
  }

  if (dom.automationStatus) {
    if (!isAdmin()) {
      dom.automationStatus.textContent = 'Connexion admin requise pour modifier.';
    } else if (!settings.enabled) {
      dom.automationStatus.textContent = 'Automatisation desactivee.';
    } else if (status?.lastEvaluatedAt) {
      dom.automationStatus.textContent = `Derniere evaluation: ${formatDate(status.lastEvaluatedAt)}`;
    } else {
      dom.automationStatus.textContent = 'Regles chargees, en attente de nouvelles mesures.';
    }
  }

  renderOpsStrip();
}

function updateActuatorUI(device) {
  const data = state.actuators[device];
  const nodes = actuatorNodes[device];
  if (!nodes || !data) {
    return;
  }

  if (nodes.state) {
    nodes.state.textContent = data.state === 'on' ? 'ON' : 'OFF';
  }
  if (nodes.toggle) {
    nodes.toggle.textContent = data.state === 'on' ? 'Arreter' : 'Demarrer';
  }
  if (nodes.mode) {
    if (data.mode === 'manual' && data.manualUntil) {
      nodes.mode.textContent = `Maintien manuel jusqu'a ${new Date(data.manualUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (state.automation?.settings?.enabled) {
      nodes.mode.textContent = data.automationNote ? `Auto: ${data.automationNote}` : 'Auto supervision';
    } else {
      nodes.mode.textContent = 'Auto firmware';
    }
    nodes.mode.classList.add('outline');
  }

  renderOpsStrip();
}

function updateControlsAvailability() {
  const canWrite = isAdmin() && deviceCanReceiveCommands();
  Object.entries(actuatorNodes).forEach(([device, nodes]) => {
    const pending = pendingActuators.has(device);
    if (nodes.toggle) {
      nodes.toggle.disabled = !canWrite || pending;
    }
    if (nodes.mode) {
      nodes.mode.disabled = true;
    }
  });

  if (dom.thresholdForm) {
    dom.thresholdForm.querySelectorAll('input, button').forEach((element) => {
      element.disabled = !isAdmin();
    });
  }

  if (dom.thresholdStatus) {
    if (!isAuthenticated()) {
      dom.thresholdStatus.textContent = 'Connexion technicien/admin requise.';
    } else if (!isAdmin()) {
      dom.thresholdStatus.textContent = 'Connexion admin requise pour modifier.';
    } else if (!deviceCanReceiveCommands()) {
      dom.thresholdStatus.textContent = 'ESP32 hors ligne, commandes suspendues.';
    } else {
      dom.thresholdStatus.textContent = 'Seuils modifiables (admin). Commandes ESP32: ON/OFF.';
    }
  }
}

function renderSystem() {
  const info = state.system;
  if (!info) {
    return;
  }

  if (dom.systemBackend) {
    dom.systemBackend.textContent = info.backend || '--';
  }
  if (dom.systemEngine) {
    dom.systemEngine.textContent = info.engine || '--';
  }
  if (dom.systemStatus) {
    const ok = Boolean(info.ok);
    dom.systemStatus.textContent = ok ? 'OK' : 'Erreur';
    dom.systemStatus.classList.toggle('bad', !ok);
  }
  if (dom.systemMessage) {
    const mqtt = info.mqtt || {};
    const mqttNote = mqtt.error ? ` | MQTT: ${mqtt.error}` : '';
    dom.systemMessage.textContent = `${info.message || info.note || '--'}${mqttNote}`;
  }

  const mqtt = info.mqtt || {};
  if (dom.connection) {
    if (state.device?.online) {
      dom.connection.textContent = 'Connecte';
    } else if (mqtt.connected) {
      dom.connection.textContent = 'En attente ESP32';
    } else {
      dom.connection.textContent = 'Non connecte';
    }
  }

  updateControlsAvailability();
  renderOpsStrip();
}

function renderDevice() {
  const device = state.device;
  if (!device) {
    return;
  }

  if (dom.deviceStatus) {
    dom.deviceStatus.textContent = device.online ? 'En ligne' : 'Hors ligne';
    dom.deviceStatus.classList.toggle('bad', !device.online);
  }
  if (dom.deviceLastSeen) {
    dom.deviceLastSeen.textContent = formatDate(device.lastSeen);
  }
  if (dom.deviceIp) {
    dom.deviceIp.textContent = device.ip || '--';
  }
  if (dom.deviceRssi) {
    dom.deviceRssi.textContent = Number.isFinite(device.rssi) ? `${device.rssi} dBm` : '--';
  }

  if (device.lastCommand?.requestedAt) {
    setCommandStatus(`Dernier ordre: ${device.lastCommand.device} -> ${device.lastCommand.state} (${formatDate(device.lastCommand.requestedAt)})`);
  } else if (!device.online && state.system?.mqtt?.enabled) {
    setCommandStatus('Dernier ordre: attente connexion ESP32', true);
  }

  updateControlsAvailability();
  renderOpsStrip();
}

function updateAuthUI(user) {
  state.auth = user || { role: 'visitor' };
  const admin = isAdmin();
  const authenticated = isAuthenticated();

  if (dom.authStatus) {
    dom.authStatus.textContent = authenticated
      ? `Session: ${state.auth.username} (${state.auth.role})`
      : 'Session: visiteur';
  }
  if (dom.authLogout) {
    dom.authLogout.style.display = authenticated ? 'inline-flex' : 'none';
  }
  if (dom.adminSection) {
    dom.adminSection.classList.toggle('active', admin);
  }
  if (dom.adminLink) {
    dom.adminLink.style.display = admin ? 'inline-flex' : 'none';
  }
  if (dom.adminRole) {
    dom.adminRole.textContent = authenticated ? state.auth.role : 'Visiteur';
  }
  if (dom.adminAccess) {
    dom.adminAccess.textContent = admin ? 'Ecriture' : authenticated ? 'Lecture' : 'Lecture seule';
    dom.adminAccess.classList.toggle('bad', !authenticated);
  }
  if (dom.adminUser) {
    dom.adminUser.textContent = authenticated ? state.auth.username : 'Non connecte';
  }
  if (dom.authError) {
    dom.authError.textContent = '';
  }

  updateControlsAvailability();
  renderEmailNotifications();
  renderAutomation();
  if (!authenticated) {
    setLockedUI();
  }
}

function drawChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const items = state.history.slice(-30);
  if (!items.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const temps = items.map((item) => item.temperature);
  const phs = items.map((item) => item.ph);
  const min = Math.min(...temps, ...phs);
  const max = Math.max(...temps, ...phs);
  const padding = 30;
  const width = canvas.width - padding * 2;
  const height = canvas.height - padding * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#dde3e8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, canvas.height - padding);
  ctx.lineTo(canvas.width - padding, canvas.height - padding);
  ctx.stroke();

  const drawLine = (values, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = padding + (index / (values.length - 1 || 1)) * width;
      const y = canvas.height - padding - ((value - min) / (max - min || 1)) * height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  };

  drawLine(temps, '#2e6ccf');
  drawLine(phs, '#f2a900');

  ctx.fillStyle = '#5b6b73';
  ctx.font = '12px "Source Sans 3", sans-serif';
  ctx.fillText('Temp vs pH', padding, padding - 10);
}

function applyDashboard(payload) {
  state.history = Array.isArray(payload.history) ? payload.history : [];
  state.thresholds = payload.thresholds || {};
  state.actuators = payload.actuators || {};
  state.alerts = payload.alerts || [];
  state.logs = payload.logs || [];
  state.notifications = payload.notifications || null;
  state.automation = payload.automation || null;
  state.system = payload.system || null;
  state.device = payload.device || null;
  seenAlertIds.clear();
  state.alerts.forEach((alert) => seenAlertIds.add(alert.id));

  updateThresholdForm();
  updateMetricUI(payload.latestMetric || state.history[state.history.length - 1]);
  renderAlerts();
  renderHistory();
  renderLogs();
  updateActuatorUI('pump');
  updateActuatorUI('heater');
  renderEmailNotifications();
  renderAutomation();
  renderBrowserNotificationControls();
  renderSystem();
  renderDevice();
  renderOpsStrip();
  drawChart();

  if (!payload.latestMetric && !state.history.length) {
    setDisconnectedUI('Aucune mesure disponible');
  }
}

function pushMetric(metric) {
  if (!metric || !metric.timestamp) {
    return;
  }

  const previous = state.history[state.history.length - 1];
  if (previous && previous.timestamp === metric.timestamp) {
    state.history[state.history.length - 1] = metric;
  } else {
    state.history.push(metric);
  }

  if (state.history.length > 120) {
    state.history = state.history.slice(-120);
  }

  updateMetricUI(metric);
  renderHistory();
  drawChart();
}

async function fetchDashboard() {
  const payload = await apiRequest('/dashboard');
  applyDashboard(payload);
}

async function fetchAuth() {
  const data = await apiRequest('/auth/me');
  updateAuthUI(data.user || { role: 'visitor' });
}

async function refreshData() {
  await fetchAuth();
  if (!isAuthenticated()) {
    setLockedUI();
    setApiStatus(true, 'API: en ligne, connexion requise');
    return;
  }
  await fetchDashboard();
  setApiStatus(true, state.sseConnected ? 'API: en ligne + temps reel' : 'API: en ligne');
}

async function safeTask(task) {
  try {
    await task();
  } catch (error) {
    if (error.message === 'Unauthorized') {
      updateAuthUI({ role: 'visitor' });
      setApiStatus(true, 'API: en ligne, connexion requise');
      return;
    }
    setApiStatus(false, `API: erreur (${error.message})`);
    console.error(error);
  }
}

async function sendActuatorCommand(device, payload) {
  const nodes = actuatorNodes[device];
  if (!nodes) {
    return;
  }

  pendingActuators.add(device);
  updateControlsAvailability();

  try {
    const result = await apiRequest(`/actuators/${device}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.actuators[device] = result.actuator;
    updateActuatorUI(device);
    setCommandStatus(`Dernier ordre: ${device} -> ${result.actuator.state} (${result.delivery?.channel || 'local'})`);
  } catch (error) {
    setCommandStatus(`Echec commande ${device}: ${error.message}`, true);
    throw error;
  } finally {
    pendingActuators.delete(device);
    updateControlsAvailability();
  }
}

function exportCsv() {
  if (!state.history.length) {
    return;
  }

  const header = ['timestamp', 'temperature', 'ph', 'turbidity', 'water_level', 'humidity'];
  const rows = [header.join(',')];
  state.history.forEach((item) => {
    rows.push([
      item.timestamp,
      item.temperature,
      item.ph,
      item.turbidity,
      item.water_level,
      item.humidity,
    ].join(','));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'metrics_export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function setupControls() {
  Object.keys(actuatorNodes).forEach((device) => {
    actuatorNodes[device].toggle?.addEventListener('click', async () => {
      const current = state.actuators[device];
      const nextState = current?.state === 'on' ? 'off' : 'on';
      await safeTask(() => sendActuatorCommand(device, { state: nextState }));
    });
  });

  dom.thresholdForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      temperature: {
        min: dom.thresholdForm.temperature_min.value,
        max: dom.thresholdForm.temperature_max.value,
      },
      ph: {
        min: dom.thresholdForm.ph_min.value,
        max: dom.thresholdForm.ph_max.value,
      },
      turbidity: {
        max: dom.thresholdForm.turbidity_max.value,
      },
      water_level: {
        min: dom.thresholdForm.water_level_min.value,
        max: dom.thresholdForm.water_level_max.value,
      },
      humidity: {
        min: dom.thresholdForm.humidity_min.value,
        max: dom.thresholdForm.humidity_max.value,
      },
    };

    await safeTask(async () => {
      const result = await apiRequest('/thresholds', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.thresholds = result.thresholds || {};
      updateThresholdForm();
      if (dom.thresholdStatus) {
        dom.thresholdStatus.textContent = 'Seuils sauvegardes.';
        setTimeout(() => updateControlsAvailability(), 2000);
      }
    });
  });

  document.querySelectorAll('[data-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.scroll;
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('[data-admin-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.adminScroll;
      const section = document.querySelector(`.${target}`) || document.getElementById(target);
      section?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  dom.exportBtn?.addEventListener('click', exportCsv);
  dom.refreshBtn?.addEventListener('click', () => {
    safeTask(refreshData);
  });
}

function setupNotifications() {
  renderBrowserNotificationControls();
  dom.browserEnabled?.addEventListener('change', () => {
    browserNotificationPrefs.enabled = dom.browserEnabled.checked;
    saveBrowserNotificationPrefs();
    renderBrowserNotificationControls();
    renderOpsStrip();
  });

  dom.browserCriticalOnly?.addEventListener('change', () => {
    browserNotificationPrefs.criticalOnly = dom.browserCriticalOnly.checked;
    saveBrowserNotificationPrefs();
    renderBrowserNotificationControls();
  });

  dom.browserPermission?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      renderBrowserNotificationControls();
      return;
    }
    await Notification.requestPermission();
    renderBrowserNotificationControls();
  });

  dom.emailForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await safeTask(async () => {
      const result = await apiRequest('/notifications', {
        method: 'POST',
        body: JSON.stringify({
          email: {
            enabled: dom.emailForm.email_enabled.checked,
            to: dom.emailForm.email_to.value,
            criticalOnly: dom.emailForm.email_critical_only.checked,
          },
        }),
      });
      state.notifications = result;
      renderEmailNotifications();
    });
  });

  dom.emailTest?.addEventListener('click', async () => {
    await safeTask(async () => {
      await apiRequest('/notifications/test', { method: 'POST' });
      if (dom.emailStatus) {
        dom.emailStatus.textContent = 'Email de test envoye.';
      }
    });
  });

  dom.automationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await safeTask(async () => {
      const result = await apiRequest('/automation', {
        method: 'POST',
        body: JSON.stringify({
          enabled: dom.automationForm.automation_enabled.checked,
          manualHoldMinutes: dom.automationForm.manual_hold_minutes.value,
          heater: {
            enabled: dom.automationForm.heater_enabled.checked,
            minTemp: dom.automationForm.heater_min_temp.value,
            maxTemp: dom.automationForm.heater_max_temp.value,
          },
          pump: {
            enabled: dom.automationForm.pump_enabled.checked,
            lowLevelCutoff: dom.automationForm.pump_low_level_cutoff.value,
            turbidityStart: dom.automationForm.pump_turbidity_start.value,
            turbidityStop: dom.automationForm.pump_turbidity_stop.value,
            cycleOnMinutes: dom.automationForm.pump_cycle_on_minutes.value,
            cycleOffMinutes: dom.automationForm.pump_cycle_off_minutes.value,
          },
        }),
      });
      state.automation = result;
      renderAutomation();
    });
  });
}

function setupAuth() {
  dom.authOpen?.addEventListener('click', () => {
    dom.authModal?.classList.add('active');
  });

  dom.authClose?.addEventListener('click', () => {
    dom.authModal?.classList.remove('active');
  });

  dom.authModal?.addEventListener('click', (event) => {
    if (event.target === dom.authModal) {
      dom.authModal.classList.remove('active');
    }
  });

  dom.authForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(dom.authForm);

    try {
      const result = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      });
      updateAuthUI(result.user);
      dom.authModal?.classList.remove('active');
      await refreshData();
      connectEvents();
    } catch (error) {
      if (dom.authError) {
        dom.authError.textContent = error.message;
      }
      if (error.message !== 'Invalid credentials') {
        setApiStatus(false, `API: hors ligne (${error.message})`);
      }
    }
  });

  dom.authLogout?.addEventListener('click', async () => {
    await safeTask(async () => {
      await apiRequest('/auth/logout', { method: 'POST' });
      updateAuthUI({ role: 'visitor' });
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        state.sseConnected = false;
      }
      setLockedUI();
    });
  });
}

function setupReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll('.reveal').forEach((section) => observer.observe(section));
}

function handleServerEvent(type, data) {
  if (type === 'system') {
    state.system = data;
    renderSystem();
    return;
  }

  if (type === 'device') {
    state.device = data;
    renderDevice();
    return;
  }

  if (type === 'metric') {
    pushMetric(data.metric);
    return;
  }

  if (type === 'alerts') {
    const nextAlerts = data.items || [];
    const freshAlerts = nextAlerts.filter((alert) => !seenAlertIds.has(alert.id));
    nextAlerts.forEach((alert) => seenAlertIds.add(alert.id));
    state.alerts = nextAlerts;
    renderAlerts();
    renderOpsStrip();
    maybeNotifyBrowserAlerts(freshAlerts);
    return;
  }

  if (type === 'logs') {
    state.logs = data.items || [];
    renderLogs();
    return;
  }

  if (type === 'thresholds') {
    state.thresholds = data || {};
    updateThresholdForm();
    updateMetricUI(state.history[state.history.length - 1]);
    return;
  }

  if (type === 'notifications') {
    state.notifications = data;
    renderEmailNotifications();
    renderOpsStrip();
    return;
  }

  if (type === 'automation') {
    state.automation = data;
    renderAutomation();
    updateActuatorUI('pump');
    updateActuatorUI('heater');
    return;
  }

  if (type === 'actuator' && data.device && data.actuator) {
    state.actuators[data.device] = data.actuator;
    updateActuatorUI(data.device);
  }
}

function connectEvents() {
  if (!window.EventSource || !isAuthenticated()) {
    return;
  }

  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`${apiBase}/events`);

  eventSource.addEventListener('open', () => {
    state.sseConnected = true;
    setApiStatus(true, 'API: en ligne + temps reel');
  });

  eventSource.addEventListener('error', () => {
    state.sseConnected = false;
    setApiStatus(isAuthenticated(), isAuthenticated() ? 'API: flux temps reel indisponible' : 'API: en ligne, connexion requise');
  });

  ['system', 'device', 'metric', 'alerts', 'logs', 'thresholds', 'actuator', 'notifications', 'automation'].forEach((type) => {
    eventSource.addEventListener(type, (event) => {
      try {
        handleServerEvent(type, JSON.parse(event.data));
      } catch (error) {
        console.error(error);
      }
    });
  });
}

async function init() {
  setupControls();
  setupNotifications();
  setupAuth();
  setupReveal();

  await safeTask(refreshData);
  if (isAuthenticated()) {
    connectEvents();
  }

  setInterval(() => {
    if (!state.sseConnected) {
      safeTask(fetchDashboard);
    }
  }, 20000);

  setInterval(() => {
    safeTask(fetchAuth);
  }, 60000);
}

init();
