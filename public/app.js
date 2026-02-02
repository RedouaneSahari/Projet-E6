const state = {
  history: [],
  thresholds: {},
  actuators: {},
  alerts: [],
};

const apiBase = document.documentElement.dataset.apiBase || '/api/v1';

const metricNodes = document.querySelectorAll('[data-metric]');
const metricCards = document.querySelectorAll('[data-metric-card]');
const lastUpdateNode = document.querySelector('[data-last-update]');
const alertListNode = document.querySelector('[data-alert-list]');
const historyNode = document.querySelector('[data-history-table]');
const logNode = document.querySelector('[data-log-list]');
const thresholdForm = document.querySelector('[data-threshold-form]');
const thresholdStatus = document.querySelector('[data-threshold-status]');
const exportBtn = document.querySelector('[data-export]');
const refreshBtn = document.querySelector('[data-refresh]');
const apiStatus = document.querySelector('[data-api-status]');
const connectionNode = document.querySelector('[data-connection]');
const systemBackend = document.querySelector('[data-system-backend]');
const systemEngine = document.querySelector('[data-system-engine]');
const systemStatus = document.querySelector('[data-system-status]');
const systemMessage = document.querySelector('[data-system-message]');
const authStatus = document.querySelector('[data-auth-status]');
const authOpen = document.querySelector('[data-auth-open]');
const authLogout = document.querySelector('[data-auth-logout]');
const authModal = document.querySelector('[data-auth-modal]');
const authClose = document.querySelector('[data-auth-close]');
const authForm = document.querySelector('[data-auth-form]');
const adminSection = document.querySelector('[data-admin-section]');
const adminLink = document.querySelector('[data-admin-link]');
const adminRole = document.querySelector('[data-admin-role]');
const adminAccess = document.querySelector('[data-admin-access]');
const adminUser = document.querySelector('[data-admin-user]');
let isAdmin = false;

function qs(selector) {
  return document.querySelector(selector);
}

function toFixed(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }
  return Number(value).toFixed(decimals);
}

function setApiStatus(online, message) {
  if (apiStatus) {
    apiStatus.textContent = message;
    apiStatus.classList.toggle('offline', !online);
  }
  if (connectionNode) {
    connectionNode.textContent = online ? 'Online' : 'Offline';
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || 'Request failed';
    throw new Error(message);
  }
  return data;
}

function updateMetricUI(metric) {
  metricNodes.forEach((node) => {
    const key = node.dataset.metric;
    if (!key) return;
    const value = metric[key];
    const decimals = key === 'ph' ? 2 : 1;
    node.textContent = toFixed(value, decimals);
  });
  if (lastUpdateNode && metric.timestamp) {
    lastUpdateNode.textContent = `Derniere mise a jour: ${metric.timestamp}`;
  }
  applyMetricStatus(metric);
}

function applyMetricStatus(metric) {
  metricCards.forEach((card) => {
    const key = card.dataset.metricCard;
    if (!key || metric[key] === undefined) return;
    const threshold = state.thresholds[key] || {};
    const status = computeStatus(metric[key], threshold.min, threshold.max);
    card.classList.remove('ok', 'warn', 'critical');
    card.classList.add(status);
  });
}

function computeStatus(value, min, max) {
  if (min === undefined && max === undefined) return 'ok';
  if (min !== undefined && value < min) {
    return value < min * 0.9 ? 'critical' : 'warn';
  }
  if (max !== undefined && value > max) {
    return value > max * 1.1 ? 'critical' : 'warn';
  }
  return 'ok';
}

function updateThresholdForm(thresholds) {
  if (!thresholdForm) return;
  thresholdForm.temperature_min.value = thresholds.temperature?.min ?? '';
  thresholdForm.temperature_max.value = thresholds.temperature?.max ?? '';
  thresholdForm.ph_min.value = thresholds.ph?.min ?? '';
  thresholdForm.ph_max.value = thresholds.ph?.max ?? '';
  thresholdForm.turbidity_max.value = thresholds.turbidity?.max ?? '';
  thresholdForm.water_level_min.value = thresholds.water_level?.min ?? '';
  thresholdForm.water_level_max.value = thresholds.water_level?.max ?? '';
  thresholdForm.humidity_min.value = thresholds.humidity?.min ?? '';
  thresholdForm.humidity_max.value = thresholds.humidity?.max ?? '';
}

function renderAlerts(alerts) {
  if (!alertListNode) return;
  if (!alerts.length) {
    alertListNode.innerHTML = '<p class="form-hint">Aucune alerte recente.</p>';
    return;
  }
  alertListNode.innerHTML = alerts
    .slice()
    .reverse()
    .map((alert) => {
      const severityClass = alert.severity === 'critical' ? 'alert-item critical' : 'alert-item';
      return `
        <div class="${severityClass}">
          <div class="alert-title">${alert.message}</div>
          <div class="alert-meta">${alert.timestamp} | ${alert.type}</div>
        </div>
      `;
    })
    .join('');
}

function renderSystem(info) {
  if (!info) return;
  if (systemBackend) {
    systemBackend.textContent = info.backend || '--';
  }
  if (systemEngine) {
    systemEngine.textContent = info.engine || '--';
  }
  if (systemStatus) {
    const statusText = info.ok ? 'OK' : 'Erreur';
    systemStatus.textContent = statusText;
    systemStatus.classList.toggle('bad', !info.ok);
  }
  if (systemMessage) {
    systemMessage.textContent = info.message || info.note || '--';
  }
}

function setControlsEnabled(enabled) {
  document.querySelectorAll('[data-toggle], [data-mode]').forEach((btn) => {
    btn.disabled = !enabled;
  });
  if (thresholdForm) {
    thresholdForm.querySelectorAll('input, button').forEach((el) => {
      el.disabled = !enabled;
    });
  }
  if (thresholdStatus) {
    thresholdStatus.textContent = enabled
      ? 'Seuils modifiables (admin).'
      : 'Connexion admin requise pour modifier.';
  }
  if (authLogout) {
    authLogout.style.display = enabled ? 'inline-flex' : 'none';
  }
}

function updateAuthUI(user) {
  isAdmin = user && user.role === 'admin';
  if (authStatus) {
    authStatus.textContent = isAdmin ? `Session: ${user.username}` : 'Session: visiteur';
  }
  setControlsEnabled(isAdmin);
  if (adminSection) {
    adminSection.classList.toggle('active', isAdmin);
  }
  if (adminLink) {
    adminLink.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  if (adminRole) {
    adminRole.textContent = isAdmin ? 'Admin' : 'Visiteur';
  }
  if (adminAccess) {
    adminAccess.textContent = isAdmin ? 'Ecriture' : 'Lecture seule';
    adminAccess.classList.toggle('bad', !isAdmin);
  }
  if (adminUser) {
    adminUser.textContent = isAdmin ? user.username : 'Non connecte';
  }
}

function renderHistory(history) {
  if (!historyNode) return;
  if (!history.length) {
    historyNode.innerHTML = '<p class="form-hint">Historique vide.</p>';
    return;
  }
  const rows = history.slice(-12).reverse();
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
        <div>${item.timestamp}</div>
        <div>${toFixed(item.temperature, 1)}</div>
        <div>${toFixed(item.ph, 2)}</div>
        <div>${toFixed(item.turbidity, 1)}</div>
        <div>${toFixed(item.water_level, 1)}</div>
        <div>${toFixed(item.humidity, 1)}</div>
      </div>
    `)
    .join('');
  historyNode.innerHTML = header + body;
}

function renderLogs(logs) {
  if (!logNode) return;
  if (!logs.length) {
    logNode.innerHTML = '<p class="form-hint">Aucun log pour le moment.</p>';
    return;
  }
  logNode.innerHTML = logs
    .slice()
    .reverse()
    .map((line) => `<div class="log-item">${line}</div>`)
    .join('');
}

function updateActuatorUI(device, data) {
  if (!data) return;
  const stateNode = qs(`[data-actuator-state="${device}"]`);
  const modeBtn = qs(`[data-mode="${device}"]`);
  if (stateNode) {
    stateNode.textContent = data.state === 'on' ? 'ON' : 'OFF';
  }
  if (modeBtn) {
    modeBtn.textContent = data.mode === 'auto' ? 'Mode auto' : 'Mode manuel';
    modeBtn.classList.toggle('outline', data.mode === 'manual');
  }
}

async function fetchLatest() {
  const metric = await apiRequest('/metrics/latest');
  if (!metric || !metric.timestamp) {
    if (lastUpdateNode) {
      lastUpdateNode.textContent = 'En attente des donnees ESP32...';
    }
    return;
  }
  updateMetricUI(metric);
  state.history.push(metric);
  if (state.history.length > 120) {
    state.history = state.history.slice(-120);
  }
  drawChart();
  renderHistory(state.history);
}

async function fetchHistory() {
  const data = await apiRequest('/metrics/history?limit=60');
  state.history = data.items || [];
  if (state.history.length) {
    updateMetricUI(state.history[state.history.length - 1]);
  }
  drawChart();
  renderHistory(state.history);
}

async function fetchThresholds() {
  state.thresholds = await apiRequest('/thresholds');
  updateThresholdForm(state.thresholds);
}

async function fetchActuators() {
  const pump = await apiRequest('/actuators/pump');
  const heater = await apiRequest('/actuators/heater');
  state.actuators = { pump, heater };
  updateActuatorUI('pump', pump);
  updateActuatorUI('heater', heater);
}

async function fetchAlerts() {
  const data = await apiRequest('/alerts?limit=50');
  state.alerts = data.items || [];
  renderAlerts(state.alerts);
}

async function fetchLogs() {
  const data = await apiRequest('/logs/actuators');
  renderLogs(data.items || []);
}

async function fetchSystem() {
  const info = await apiRequest('/system');
  renderSystem(info);
}

async function fetchAuth() {
  const data = await apiRequest('/auth/me');
  updateAuthUI(data.user || { role: 'visitor' });
}

function drawChart() {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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

function exportCsv() {
  if (!state.history.length) return;
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
  document.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const device = btn.dataset.toggle;
      if (!device) return;
      const current = state.actuators[device];
      const nextState = current?.state === 'on' ? 'off' : 'on';
      const result = await apiRequest(`/actuators/${device}`, {
        method: 'POST',
        body: JSON.stringify({ state: nextState }),
      });
      state.actuators[device] = result.actuator;
      updateActuatorUI(device, result.actuator);
      fetchLogs();
    });
  });

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const device = btn.dataset.mode;
      if (!device) return;
      const current = state.actuators[device];
      const nextMode = current?.mode === 'auto' ? 'manual' : 'auto';
      const result = await apiRequest(`/actuators/${device}`, {
        method: 'POST',
        body: JSON.stringify({ mode: nextMode }),
      });
      state.actuators[device] = result.actuator;
      updateActuatorUI(device, result.actuator);
      fetchLogs();
    });
  });

  if (thresholdForm) {
    thresholdForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = {
        temperature: {
          min: thresholdForm.temperature_min.value,
          max: thresholdForm.temperature_max.value,
        },
        ph: {
          min: thresholdForm.ph_min.value,
          max: thresholdForm.ph_max.value,
        },
        turbidity: {
          max: thresholdForm.turbidity_max.value,
        },
        water_level: {
          min: thresholdForm.water_level_min.value,
          max: thresholdForm.water_level_max.value,
        },
        humidity: {
          min: thresholdForm.humidity_min.value,
          max: thresholdForm.humidity_max.value,
        },
      };
      await apiRequest('/thresholds', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await fetchThresholds();
      if (thresholdStatus) {
        thresholdStatus.textContent = 'Seuils sauvegardes.';
        setTimeout(() => {
          thresholdStatus.textContent = 'Seuils modifiables.';
        }, 2000);
      }
    });
  }

  document.querySelectorAll('[data-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.scroll;
      if (!target) return;
      const section = document.getElementById(target);
      section?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  document.querySelectorAll('[data-admin-scroll]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.adminScroll;
      if (!target) return;
      const section = document.querySelector(`.${target}`) || document.getElementById(target);
      section?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', exportCsv);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      safeFetch(fetchLatest);
      safeFetch(fetchAlerts);
      safeFetch(fetchLogs);
      safeFetch(fetchSystem);
    });
  }
}

function setupAuth() {
  if (authOpen) {
    authOpen.addEventListener('click', () => {
      authModal?.classList.add('active');
    });
  }
  if (authClose) {
    authClose.addEventListener('click', () => {
      authModal?.classList.remove('active');
    });
  }
  if (authModal) {
    authModal.addEventListener('click', (event) => {
      if (event.target === authModal) {
        authModal.classList.remove('active');
      }
    });
  }
  if (authForm) {
    authForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(authForm);
      try {
        const result = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: formData.get('username'),
            password: formData.get('password'),
          }),
        });
        updateAuthUI(result.user);
        authModal?.classList.remove('active');
      } catch (error) {
        alert(error.message);
      }
    });
  }
  if (authLogout) {
    authLogout.addEventListener('click', async () => {
      await apiRequest('/auth/logout', { method: 'POST' });
      updateAuthUI({ role: 'visitor' });
    });
  }
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

async function safeFetch(task) {
  try {
    await task();
    setApiStatus(true, 'API: en ligne');
  } catch (error) {
    setApiStatus(false, `API: hors ligne (${error.message})`);
    console.error(error);
  }
}

async function init() {
  setupControls();
  setupAuth();
  setupReveal();
  await safeFetch(fetchAuth);
  await safeFetch(fetchThresholds);
  await safeFetch(fetchActuators);
  await safeFetch(fetchHistory);
  await safeFetch(fetchAlerts);
  await safeFetch(fetchLogs);
  await safeFetch(fetchSystem);
  await safeFetch(fetchLatest);
  setInterval(() => safeFetch(fetchLatest), 8000);
  setInterval(() => safeFetch(fetchAlerts), 20000);
  setInterval(() => safeFetch(fetchLogs), 25000);
  setInterval(() => safeFetch(fetchSystem), 30000);
}

init();
