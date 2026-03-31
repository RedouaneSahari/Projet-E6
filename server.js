const http = require('http');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const mqtt = require('mqtt');
const nodemailer = require('nodemailer');
const { createStore } = require('./db');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORAGE_DIR = path.join(__dirname, 'storage');
const LOG_DIR = path.join(STORAGE_DIR, 'logs');
const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT || 120);
const DASHBOARD_HISTORY_LIMIT = Number(process.env.DASHBOARD_HISTORY_LIMIT || 60);
const DASHBOARD_ALERT_LIMIT = Number(process.env.DASHBOARD_ALERT_LIMIT || 50);
const DASHBOARD_LOG_LIMIT = Number(process.env.DASHBOARD_LOG_LIMIT || 80);
const SESSION_COOKIE = 'e6_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const TECH_USER = process.env.TECH_USER || 'technicien';
const TECH_PASS = process.env.TECH_PASS || 'tech123';
const MQTT_ENABLED = (process.env.MQTT_ENABLED || '1') === '1';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_METRICS_TOPIC = process.env.MQTT_TOPIC || 'tp/esp32/telemetry';
const MQTT_COMMAND_TOPIC = process.env.MQTT_COMMAND_TOPIC || 'tp/esp32/cmd';
const MQTT_STATE_TOPIC = process.env.MQTT_STATE_TOPIC || 'tp/esp32/state';
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || 'projet-e6-server';
const MQTT_DEVICE_TIMEOUT_MS = Number(process.env.MQTT_DEVICE_TIMEOUT_MS || 30000);
const SMTP_URL = process.env.SMTP_URL || '';
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = (process.env.SMTP_SECURE || '0') === '1';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || '';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO || '';
const RESPONSE_JSON_INDENT = process.env.NODE_ENV === 'development' ? 2 : 0;

const paths = {
  metrics: path.join(STORAGE_DIR, 'metrics.json'),
  thresholds: path.join(STORAGE_DIR, 'thresholds.json'),
  actuators: path.join(STORAGE_DIR, 'actuators.json'),
  alerts: path.join(STORAGE_DIR, 'alerts.json'),
  notifications: path.join(STORAGE_DIR, 'notifications.json'),
  automation: path.join(STORAGE_DIR, 'automation.json'),
  log: path.join(LOG_DIR, 'actuators.log'),
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

const DEFAULT_THRESHOLDS = {
  temperature: { min: 22.0, max: 28.0, unit: 'C' },
  ph: { min: 6.8, max: 7.8 },
  turbidity: { max: 22.0, unit: 'NTU' },
  water_level: { min: 60.0, max: 90.0, unit: '%' },
  humidity: { min: 35.0, max: 70.0, unit: '%' },
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  email: {
    enabled: false,
    to: ALERT_EMAIL_TO,
    criticalOnly: true,
  },
};

const DEFAULT_AUTOMATION_SETTINGS = {
  enabled: false,
  manualHoldMinutes: 20,
  heater: {
    enabled: true,
    minTemp: 22.0,
    maxTemp: 26.0,
  },
  pump: {
    enabled: true,
    lowLevelCutoff: 58.0,
    turbidityStart: 24.0,
    turbidityStop: 18.0,
    cycleOnMinutes: 10,
    cycleOffMinutes: 20,
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultActuators() {
  const now = new Date().toISOString();
  return {
    pump: { state: 'off', mode: 'auto', lastChanged: now, manualUntil: null, automationNote: null },
    heater: { state: 'off', mode: 'auto', lastChanged: now, manualUntil: null, automationNote: null },
  };
}

function createDefaultDeviceState() {
  const actuators = createDefaultActuators();
  return {
    deviceId: 'esp32',
    firmware: null,
    ip: null,
    rssi: null,
    freeHeap: null,
    uptimeMs: null,
    lastSeen: null,
    lastTelemetry: null,
    lastState: null,
    lastCommand: null,
    pump: actuators.pump,
    heater: actuators.heater,
  };
}

let store;
let mqttClient = null;
let emailTransporter = null;

const sessions = new Map();
const eventClients = new Set();
const fileWrites = new Map();

const runtimeState = {
  thresholds: clone(DEFAULT_THRESHOLDS),
  actuators: createDefaultActuators(),
  alerts: [],
  logs: [],
  device: createDefaultDeviceState(),
  notifications: clone(DEFAULT_NOTIFICATION_SETTINGS),
  notificationStatus: {
    emailConfigured: false,
    lastEmailAt: null,
    lastEmailError: null,
  },
  automation: clone(DEFAULT_AUTOMATION_SETTINGS),
  automationStatus: {
    lastEvaluatedAt: null,
    lastActionAt: null,
    lastAction: null,
  },
};

let mqttStatus = {
  enabled: false,
  connected: false,
  url: MQTT_URL,
  metricsTopic: MQTT_METRICS_TOPIC,
  commandTopic: MQTT_COMMAND_TOPIC,
  stateTopic: MQTT_STATE_TOPIC,
  lastMessage: null,
  lastState: null,
  error: null,
};

let mqttLastLog = {
  message: null,
  time: 0,
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return clone(fallback);
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return clone(fallback);
    }
    const data = JSON.parse(raw);
    return data ?? clone(fallback);
  } catch (error) {
    return clone(fallback);
  }
}

function readLogLines(filePath, limit = 200) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit);
  } catch (error) {
    return [];
  }
}

function queueFileWrite(key, task) {
  const previous = fileWrites.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  fileWrites.set(key, next);
  return next;
}

function writeJson(filePath, data) {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  return queueFileWrite(filePath, () => fsPromises.writeFile(filePath, payload, 'utf8'));
}

function appendFile(filePath, line) {
  return queueFileWrite(filePath, () => fsPromises.appendFile(filePath, `${line}\n`, 'utf8'));
}

function sanitizeLimit(value, fallback, max = 200) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeAdcToPercent(value) {
  return round(clamp((value / 4095) * 100, 0, 100), 1);
}

function normalizeAdcToPh(value) {
  return round(clamp((value / 4095) * 14, 0, 14), 2);
}

function normalizeAdcToTurbidity(value) {
  return round(clamp((value / 4095) * 40, 0, 40), 1);
}

function normalizeBinaryState(value, fallback = 'off') {
  if (value === true || value === 1 || value === '1' || value === 'on' || value === 'ON') {
    return 'on';
  }
  if (value === false || value === 0 || value === '0' || value === 'off' || value === 'OFF') {
    return 'off';
  }
  return fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function seedMetrics() {
  const now = Date.now();
  const items = [];
  for (let i = 11; i >= 0; i -= 1) {
    const timestamp = new Date(now - i * 10 * 60 * 1000).toISOString();
    const temp = 24.2 + Math.sin(i / 3) * 0.8;
    const ph = 7.2 + Math.cos(i / 4) * 0.2;
    const turb = 14 + Math.sin(i / 2) * 3;
    const level = 78 + Math.cos(i / 5) * 4;
    const hum = 52 + Math.sin(i / 6) * 5;
    items.push({
      timestamp,
      temperature: round(temp, 1),
      ph: round(ph, 2),
      turbidity: round(turb, 1),
      water_level: round(level, 1),
      humidity: round(hum, 1),
    });
  }
  return items;
}

function ensureSeed() {
  ensureDir(STORAGE_DIR);
  ensureDir(LOG_DIR);

  if (!fs.existsSync(paths.thresholds)) {
    fs.writeFileSync(paths.thresholds, `${JSON.stringify(DEFAULT_THRESHOLDS, null, 2)}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.actuators)) {
    fs.writeFileSync(paths.actuators, `${JSON.stringify(createDefaultActuators(), null, 2)}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.alerts)) {
    fs.writeFileSync(paths.alerts, '[]\n', 'utf8');
  }

  if (!fs.existsSync(paths.notifications)) {
    fs.writeFileSync(paths.notifications, `${JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS, null, 2)}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.automation)) {
    fs.writeFileSync(paths.automation, `${JSON.stringify(DEFAULT_AUTOMATION_SETTINGS, null, 2)}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.log)) {
    fs.writeFileSync(paths.log, '', 'utf8');
  }
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeActuatorRecord(entry, fallback) {
  const safeFallback = fallback || {
    state: 'off',
    mode: 'auto',
    lastChanged: new Date().toISOString(),
    manualUntil: null,
    automationNote: null,
  };
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    state: source.state === 'on' ? 'on' : source.state === 'off' ? 'off' : safeFallback.state,
    mode: source.mode === 'manual' ? 'manual' : source.mode === 'auto' ? 'auto' : safeFallback.mode,
    lastChanged: isIsoTimestamp(source.lastChanged) ? source.lastChanged : safeFallback.lastChanged,
    manualUntil: isIsoTimestamp(source.manualUntil) ? source.manualUntil : null,
    automationNote: typeof source.automationNote === 'string' && source.automationNote.trim()
      ? source.automationNote.trim()
      : null,
  };
}

function normalizeActuatorSnapshot(snapshot) {
  const defaults = createDefaultActuators();
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return {
    pump: normalizeActuatorRecord(source.pump, defaults.pump),
    heater: normalizeActuatorRecord(source.heater, defaults.heater),
  };
}

function loadRuntimeState() {
  runtimeState.thresholds = readJson(paths.thresholds, DEFAULT_THRESHOLDS);
  runtimeState.actuators = normalizeActuatorSnapshot(readJson(paths.actuators, createDefaultActuators()));
  const alerts = readJson(paths.alerts, []);
  runtimeState.notifications = normalizeNotificationSettings(readJson(paths.notifications, DEFAULT_NOTIFICATION_SETTINGS));
  runtimeState.automation = normalizeAutomationSettings(readJson(paths.automation, DEFAULT_AUTOMATION_SETTINGS));
  runtimeState.alerts = Array.isArray(alerts) ? alerts : [];
  runtimeState.logs = readLogLines(paths.log);
  runtimeState.device = {
    ...createDefaultDeviceState(),
    pump: clone(runtimeState.actuators.pump),
    heater: clone(runtimeState.actuators.heater),
  };
  runtimeState.notificationStatus.emailConfigured = isEmailConfigured();
}

function normalizeNotificationSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const email = source.email && typeof source.email === 'object' ? source.email : {};
  return {
    email: {
      enabled: Boolean(email.enabled),
      to: String(email.to !== undefined ? email.to : ALERT_EMAIL_TO || '').trim(),
      criticalOnly: email.criticalOnly !== undefined ? Boolean(email.criticalOnly) : true,
    },
  };
}

function normalizeAutomationSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const heater = source.heater && typeof source.heater === 'object' ? source.heater : {};
  const pump = source.pump && typeof source.pump === 'object' ? source.pump : {};

  const manualHoldMinutes = Number(source.manualHoldMinutes);
  const heaterMinTemp = Number(heater.minTemp);
  const heaterMaxTemp = Number(heater.maxTemp);
  let safeHeaterMin = Number.isFinite(heaterMinTemp) ? heaterMinTemp : DEFAULT_AUTOMATION_SETTINGS.heater.minTemp;
  let safeHeaterMax = Number.isFinite(heaterMaxTemp) ? heaterMaxTemp : DEFAULT_AUTOMATION_SETTINGS.heater.maxTemp;
  if (safeHeaterMin > safeHeaterMax) {
    const swap = safeHeaterMin;
    safeHeaterMin = safeHeaterMax;
    safeHeaterMax = swap;
  }

  const lowLevelCutoff = Number(pump.lowLevelCutoff);
  const turbidityStart = Number(pump.turbidityStart);
  const turbidityStop = Number(pump.turbidityStop);
  let safeTurbidityStart = Number.isFinite(turbidityStart) ? turbidityStart : DEFAULT_AUTOMATION_SETTINGS.pump.turbidityStart;
  let safeTurbidityStop = Number.isFinite(turbidityStop) ? turbidityStop : DEFAULT_AUTOMATION_SETTINGS.pump.turbidityStop;
  if (safeTurbidityStop > safeTurbidityStart) {
    const swap = safeTurbidityStart;
    safeTurbidityStart = safeTurbidityStop;
    safeTurbidityStop = swap;
  }

  return {
    enabled: Boolean(source.enabled),
    manualHoldMinutes: clamp(Number.isFinite(manualHoldMinutes) ? manualHoldMinutes : DEFAULT_AUTOMATION_SETTINGS.manualHoldMinutes, 1, 180),
    heater: {
      enabled: heater.enabled !== undefined ? Boolean(heater.enabled) : DEFAULT_AUTOMATION_SETTINGS.heater.enabled,
      minTemp: round(safeHeaterMin, 1),
      maxTemp: round(safeHeaterMax, 1),
    },
    pump: {
      enabled: pump.enabled !== undefined ? Boolean(pump.enabled) : DEFAULT_AUTOMATION_SETTINGS.pump.enabled,
      lowLevelCutoff: round(clamp(Number.isFinite(lowLevelCutoff) ? lowLevelCutoff : DEFAULT_AUTOMATION_SETTINGS.pump.lowLevelCutoff, 0, 100), 1),
      turbidityStart: round(clamp(safeTurbidityStart, 0, 100), 1),
      turbidityStop: round(clamp(safeTurbidityStop, 0, 100), 1),
      cycleOnMinutes: clamp(Number.isFinite(Number(pump.cycleOnMinutes)) ? Number(pump.cycleOnMinutes) : DEFAULT_AUTOMATION_SETTINGS.pump.cycleOnMinutes, 1, 240),
      cycleOffMinutes: clamp(Number.isFinite(Number(pump.cycleOffMinutes)) ? Number(pump.cycleOffMinutes) : DEFAULT_AUTOMATION_SETTINGS.pump.cycleOffMinutes, 1, 240),
    },
  };
}

function isEmailConfigured() {
  return Boolean(ALERT_EMAIL_FROM) && Boolean(SMTP_URL || SMTP_HOST);
}

function getEmailTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  if (emailTransporter) {
    return emailTransporter;
  }

  if (SMTP_URL) {
    emailTransporter = nodemailer.createTransport(SMTP_URL);
    return emailTransporter;
  }

  emailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  return emailTransporter;
}

function buildNotificationSnapshot() {
  return {
    settings: runtimeState.notifications,
    status: {
      ...runtimeState.notificationStatus,
      emailConfigured: isEmailConfigured(),
    },
  };
}

function isManualHoldActive(actuator) {
  if (!actuator || actuator.mode !== 'manual' || !actuator.manualUntil) {
    return false;
  }
  return Date.parse(actuator.manualUntil) > Date.now();
}

function buildAutomationSnapshot() {
  return {
    settings: runtimeState.automation,
    status: {
      ...runtimeState.automationStatus,
      holds: {
        pump: {
          active: isManualHoldActive(runtimeState.actuators.pump),
          until: runtimeState.actuators.pump.manualUntil,
        },
        heater: {
          active: isManualHoldActive(runtimeState.actuators.heater),
          until: runtimeState.actuators.heater.manualUntil,
        },
      },
    },
  };
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) {
      return acc;
    }
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
}

function createSession(res, user) {
  const id = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  sessions.set(id, { ...user, expiresAt });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
  return id;
}

function clearSession(req, res) {
  const cookies = parseCookies(req);
  const id = cookies[SESSION_COOKIE];
  if (id) {
    sessions.delete(id);
  }
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const id = cookies[SESSION_COOKIE];
  if (!id) {
    return null;
  }

  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(id);
    return null;
  }

  return {
    username: session.username,
    role: session.role,
  };
}

function requireAdmin(req, res) {
  const user = getSessionUser(req);
  if (!user || user.role !== 'admin') {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return user;
}

function requireAuth(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return user;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data, null, RESPONSE_JSON_INDENT);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(text);
}

function resolveStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname || '/');
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  return path.resolve(PUBLIC_DIR, relativePath);
}

function serveStatic(req, res, pathname) {
  const filePath = resolveStaticPath(pathname);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, 'Not found');
    return;
  }

  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const lastModified = new Date(Math.floor(stats.mtimeMs / 1000) * 1000).toUTCString();
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Last-Modified': lastModified,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400',
  };

  if (req.headers['if-modified-since'] === lastModified) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function computeStatus(value, min, max) {
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

function findLastAlert(alerts, type) {
  for (let i = alerts.length - 1; i >= 0; i -= 1) {
    if (alerts[i].type === type) {
      return alerts[i];
    }
  }
  return null;
}

function broadcastEvent(type, data) {
  const payload = JSON.stringify(data);
  for (const client of eventClients) {
    client.res.write(`event: ${type}\n`);
    client.res.write(`data: ${payload}\n\n`);
  }
}

async function broadcastSystemSnapshot() {
  broadcastEvent('system', await buildSystemSnapshot());
}

function broadcastNotificationSnapshot() {
  broadcastEvent('notifications', buildNotificationSnapshot());
}

function broadcastAutomationSnapshot() {
  broadcastEvent('automation', buildAutomationSnapshot());
}

function buildDeviceSnapshot() {
  const device = runtimeState.device;
  const lastSeenMs = device.lastSeen ? Date.parse(device.lastSeen) : NaN;
  const online = Number.isFinite(lastSeenMs) && (Date.now() - lastSeenMs) <= MQTT_DEVICE_TIMEOUT_MS;

  return {
    ...device,
    online,
  };
}

function applyDeviceState(update, source = 'mqtt') {
  const next = {
    ...runtimeState.device,
    ...(update.deviceId ? { deviceId: update.deviceId } : {}),
    ...(update.firmware ? { firmware: update.firmware } : {}),
    ...(update.ip ? { ip: update.ip } : {}),
    ...(Number.isFinite(update.rssi) ? { rssi: update.rssi } : {}),
    ...(Number.isFinite(update.freeHeap) ? { freeHeap: update.freeHeap } : {}),
    ...(Number.isFinite(update.uptimeMs) ? { uptimeMs: update.uptimeMs } : {}),
    ...(update.lastSeen ? { lastSeen: update.lastSeen } : {}),
    ...(update.lastTelemetry ? { lastTelemetry: update.lastTelemetry } : {}),
    ...(update.lastState ? { lastState: update.lastState } : {}),
    pump: update.pump ? normalizeActuatorRecord(update.pump, runtimeState.device.pump) : runtimeState.device.pump,
    heater: update.heater ? normalizeActuatorRecord(update.heater, runtimeState.device.heater) : runtimeState.device.heater,
    lastCommand: update.lastCommand ? update.lastCommand : runtimeState.device.lastCommand,
  };

  runtimeState.device = next;

  let actuatorsChanged = false;
  ['pump', 'heater'].forEach((deviceName) => {
    const nextActuator = next[deviceName];
    const currentActuator = runtimeState.actuators[deviceName];
    const preserveManual = isManualHoldActive(currentActuator);
    const mergedActuator = preserveManual
      ? {
        ...nextActuator,
        mode: currentActuator.mode,
        manualUntil: currentActuator.manualUntil,
        automationNote: currentActuator.automationNote,
      }
      : nextActuator;
    if (
      mergedActuator &&
      (
        mergedActuator.state !== currentActuator.state ||
        mergedActuator.mode !== currentActuator.mode ||
        mergedActuator.lastChanged !== currentActuator.lastChanged ||
        mergedActuator.manualUntil !== currentActuator.manualUntil ||
        mergedActuator.automationNote !== currentActuator.automationNote
      )
    ) {
      runtimeState.actuators[deviceName] = normalizeActuatorRecord(mergedActuator, currentActuator);
      actuatorsChanged = true;
      broadcastEvent('actuator', { device: deviceName, actuator: runtimeState.actuators[deviceName], source });
    }
  });

  if (actuatorsChanged) {
    writeJson(paths.actuators, runtimeState.actuators).catch((error) => {
      console.error('Failed to persist actuator state:', error.message);
    });
  }

  broadcastEvent('device', buildDeviceSnapshot());
}

function normalizeMetricPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload');
  }

  let timestamp = payload.timestamp || payload.time || new Date().toISOString();
  if (typeof timestamp === 'number') {
    timestamp = new Date(timestamp).toISOString();
  }
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Invalid timestamp');
  }

  const temperature = Number(payload.temperature);
  const phValue = payload.ph !== undefined ? Number(payload.ph) : Number.NaN;
  const phAdcValue = payload.ph_adc !== undefined ? Number(payload.ph_adc) : Number.NaN;
  const rawTurbidity = payload.turbidity !== undefined ? Number(payload.turbidity) : Number.NaN;
  const rawWaterLevel = payload.water_level !== undefined
    ? Number(payload.water_level)
    : payload.waterLevel !== undefined
      ? Number(payload.waterLevel)
      : Number.NaN;
  const humidityInput = payload.humidity !== undefined ? Number(payload.humidity) : 50;

  const ph = Number.isFinite(phValue)
    ? phValue
    : Number.isFinite(phAdcValue)
      ? normalizeAdcToPh(phAdcValue)
      : Number.NaN;
  const turbidity = Number.isFinite(rawTurbidity)
    ? (rawTurbidity > 100 ? normalizeAdcToTurbidity(rawTurbidity) : rawTurbidity)
    : Number.NaN;
  const waterLevel = Number.isFinite(rawWaterLevel)
    ? (rawWaterLevel > 100 ? normalizeAdcToPercent(rawWaterLevel) : rawWaterLevel)
    : Number.NaN;
  const humidity = humidityInput;

  const invalid = [
    ['temperature', temperature],
    ['ph', ph],
    ['turbidity', turbidity],
    ['water_level', waterLevel],
    ['humidity', humidity],
  ].filter(([, value]) => !Number.isFinite(value));

  if (invalid.length) {
    throw new Error(`Invalid metrics: ${invalid.map(([key]) => key).join(', ')}`);
  }

  return {
    timestamp,
    temperature: round(temperature, 1),
    ph: round(ph, 2),
    turbidity: round(turbidity, 1),
    water_level: round(waterLevel, 1),
    humidity: round(humidity, 1),
  };
}

function extractDeviceMetadata(payload, fallbackTimestamp) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const deviceId = String(payload.deviceId || payload.device_id || runtimeState.device.deviceId || 'esp32').trim();
  const ip = typeof payload.ip === 'string' && payload.ip.trim() ? payload.ip.trim() : null;
  const firmware = typeof payload.firmware === 'string' && payload.firmware.trim() ? payload.firmware.trim() : null;
  const rssi = Number(payload.rssi);
  const freeHeap = Number(payload.freeHeap ?? payload.free_heap);
  const uptimeMs = Number(payload.uptimeMs ?? payload.uptime_ms);

  const update = {
    deviceId,
    lastSeen: fallbackTimestamp,
    lastTelemetry: fallbackTimestamp,
  };

  if (ip) {
    update.ip = ip;
  }
  if (firmware) {
    update.firmware = firmware;
  }
  if (Number.isFinite(rssi)) {
    update.rssi = rssi;
  }
  if (Number.isFinite(freeHeap)) {
    update.freeHeap = freeHeap;
  }
  if (Number.isFinite(uptimeMs)) {
    update.uptimeMs = uptimeMs;
  }
  if (payload.pump && typeof payload.pump === 'object') {
    update.pump = payload.pump;
  }
  if (payload.heater && typeof payload.heater === 'object') {
    update.heater = payload.heater;
  }
  if (payload.pump_state !== undefined) {
    const nextPumpState = normalizeBinaryState(payload.pump_state, runtimeState.actuators.pump.state);
    update.pump = {
      state: nextPumpState,
      mode: 'auto',
      lastChanged: runtimeState.actuators.pump.state === nextPumpState
        ? runtimeState.actuators.pump.lastChanged
        : fallbackTimestamp,
    };
  }
  if (payload.heater_state !== undefined) {
    const nextHeaterState = normalizeBinaryState(payload.heater_state, runtimeState.actuators.heater.state);
    update.heater = {
      state: nextHeaterState,
      mode: 'auto',
      lastChanged: runtimeState.actuators.heater.state === nextHeaterState
        ? runtimeState.actuators.heater.lastChanged
        : fallbackTimestamp,
    };
  }

  return update;
}

function normalizeStatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid state payload');
  }

  const timestamp = payload.timestamp || payload.time || new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error('Invalid state timestamp');
  }

  return {
    deviceId: String(payload.deviceId || payload.device_id || runtimeState.device.deviceId || 'esp32').trim(),
    firmware: typeof payload.firmware === 'string' ? payload.firmware.trim() : null,
    ip: typeof payload.ip === 'string' ? payload.ip.trim() : null,
    rssi: Number(payload.rssi),
    freeHeap: Number(payload.freeHeap ?? payload.free_heap),
    uptimeMs: Number(payload.uptimeMs ?? payload.uptime_ms),
    lastSeen: timestamp,
    lastState: timestamp,
    pump: payload.pump,
    heater: payload.heater,
  };
}

function updateAlerts(metric) {
  const now = new Date().toISOString();
  const cooldownMs = 5 * 60 * 1000;
  const alerts = runtimeState.alerts;

  const checks = [
    { key: 'temperature', label: 'Temperature' },
    { key: 'ph', label: 'pH' },
    { key: 'turbidity', label: 'Turbidity' },
    { key: 'water_level', label: 'Water level' },
    { key: 'humidity', label: 'Humidity' },
  ];

  const newAlerts = [];

  checks.forEach((check) => {
    const entry = runtimeState.thresholds[check.key] || {};
    const value = metric[check.key];
    if (value === undefined) {
      return;
    }

    const min = entry.min;
    const max = entry.max;
    let out = false;
    let direction = '';

    if (typeof min === 'number' && value < min) {
      out = true;
      direction = 'low';
    }
    if (typeof max === 'number' && value > max) {
      out = true;
      direction = 'high';
    }
    if (!out) {
      return;
    }

    const lastAlert = findLastAlert(alerts, check.key);
    if (lastAlert) {
      const lastTime = new Date(lastAlert.timestamp).getTime();
      if (Date.now() - lastTime < cooldownMs) {
        return;
      }
    }

    let severity = 'warning';
    if ((typeof min === 'number' && value < min * 0.9) || (typeof max === 'number' && value > max * 1.1)) {
      severity = 'critical';
    }

    newAlerts.push({
      id: `alert_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      type: check.key,
      severity,
      status: computeStatus(value, min, max),
      message: `${check.label} is ${direction} (${value})`,
    });
  });

  if (!newAlerts.length) {
    return [];
  }

  runtimeState.alerts = runtimeState.alerts.concat(newAlerts).slice(-200);
  writeJson(paths.alerts, runtimeState.alerts).catch((error) => {
    console.error('Failed to persist alerts:', error.message);
  });
  broadcastEvent('alerts', { items: runtimeState.alerts.slice(-DASHBOARD_ALERT_LIMIT) });
  return newAlerts;
}

async function sendAlertEmails(alerts) {
  const settings = runtimeState.notifications.email;
  const transporter = getEmailTransporter();

  if (!settings.enabled || !settings.to || !transporter) {
    return;
  }

  const selectedAlerts = alerts.filter((alert) => !settings.criticalOnly || alert.severity === 'critical');
  if (!selectedAlerts.length) {
    return;
  }

  const text = selectedAlerts
    .map((alert) => `- ${alert.message} | ${alert.type} | ${alert.severity} | ${alert.timestamp}`)
    .join('\n');

  await transporter.sendMail({
    from: ALERT_EMAIL_FROM,
    to: settings.to,
    subject: `[Projet E6] ${selectedAlerts.length} alerte(s) bassin`,
    text: `De nouvelles alertes ont ete detectees sur le bassin.\n\n${text}\n`,
  });

  runtimeState.notificationStatus.lastEmailAt = new Date().toISOString();
  runtimeState.notificationStatus.lastEmailError = null;
  broadcastNotificationSnapshot();
}

function dispatchAlertNotifications(alerts) {
  if (!alerts.length) {
    return;
  }

  sendAlertEmails(alerts).catch((error) => {
    runtimeState.notificationStatus.lastEmailError = error.message;
    broadcastNotificationSnapshot();
    console.error('Failed to send alert email:', error.message);
  });
}

function normalizeThresholds(payload) {
  const keys = ['temperature', 'ph', 'turbidity', 'water_level', 'humidity'];
  const units = {
    temperature: 'C',
    turbidity: 'NTU',
    water_level: '%',
    humidity: '%',
  };

  const result = {};
  keys.forEach((key) => {
    const entry = payload[key] || {};
    const min = entry.min !== undefined && entry.min !== '' ? Number(entry.min) : undefined;
    const max = entry.max !== undefined && entry.max !== '' ? Number(entry.max) : undefined;
    let safeMin = Number.isFinite(min) ? min : undefined;
    let safeMax = Number.isFinite(max) ? max : undefined;
    if (safeMin !== undefined && safeMax !== undefined && safeMin > safeMax) {
      const swap = safeMin;
      safeMin = safeMax;
      safeMax = swap;
    }
    result[key] = {
      ...(safeMin !== undefined ? { min: safeMin } : {}),
      ...(safeMax !== undefined ? { max: safeMax } : {}),
      ...(units[key] ? { unit: units[key] } : {}),
    };
  });

  return result;
}

function updateActuatorState(device, nextState) {
  runtimeState.actuators[device] = normalizeActuatorRecord(nextState, runtimeState.actuators[device]);
  writeJson(paths.actuators, runtimeState.actuators).catch((error) => {
    console.error('Failed to persist actuators:', error.message);
  });
}

async function persistActuatorAndDevice(device, actuator, source, delivery) {
  updateActuatorState(device, actuator);
  applyDeviceState({
    [device]: actuator,
    lastCommand: delivery ? {
      device,
      state: actuator.state,
      mode: actuator.mode,
      requestedAt: actuator.lastChanged,
      source,
      topic: delivery.topic || null,
      channel: delivery.channel || source,
      mqttCommand: delivery.mqttCommand || null,
    } : undefined,
  }, source);
  await appendActuatorLog({
    timestamp: actuator.lastChanged,
    device,
    state: actuator.state,
    mode: actuator.mode,
    source: delivery?.channel || source,
  });
}

function appendActuatorLog(entry) {
  const line = `${entry.timestamp}\t${entry.device}\t${entry.state}\t${entry.mode}\t${entry.source}`;
  runtimeState.logs.push(line);
  if (runtimeState.logs.length > 200) {
    runtimeState.logs = runtimeState.logs.slice(-200);
  }
  broadcastEvent('logs', { items: runtimeState.logs.slice(-DASHBOARD_LOG_LIMIT) });
  return appendFile(paths.log, line);
}

function publishMqtt(topic, payload, options = { qos: 1 }) {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      reject(new Error('Broker MQTT indisponible'));
      return;
    }

    mqttClient.publish(topic, payload, options, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function buildLegacyCommand(device, state) {
  if (device === 'pump') {
    return state === 'on' ? 'PUMP_ON' : 'PUMP_OFF';
  }
  if (device === 'heater') {
    return state === 'on' ? 'HEATER_ON' : 'HEATER_OFF';
  }
  return null;
}

async function dispatchActuatorCommand(device, actuator) {
  const command = {
    device,
    state: actuator.state,
    mode: actuator.mode,
    requestedAt: actuator.lastChanged,
    source: 'dashboard',
  };

  if (!MQTT_ENABLED) {
    const channel = buildDeviceSnapshot().online ? 'http-poll' : 'local';
    runtimeState.device.lastCommand = {
      ...command,
      topic: null,
      channel,
    };
    broadcastEvent('device', buildDeviceSnapshot());
    return {
      delivered: channel !== 'local',
      channel,
      topic: null,
    };
  }

  if (mqttClient && mqttClient.connected) {
    if (!buildDeviceSnapshot().online) {
      throw new Error('ESP32 hors ligne');
    }

    const mqttCommand = buildLegacyCommand(device, actuator.state);
    if (!mqttCommand) {
      throw new Error('Commande non supportee');
    }

    await publishMqtt(MQTT_COMMAND_TOPIC, mqttCommand);
    runtimeState.device.lastCommand = {
      ...command,
      topic: MQTT_COMMAND_TOPIC,
      channel: 'mqtt',
      mqttCommand,
    };
    broadcastEvent('device', buildDeviceSnapshot());

    return {
      delivered: true,
      channel: 'mqtt',
      topic: MQTT_COMMAND_TOPIC,
      mqttCommand,
    };
  }

  if (!buildDeviceSnapshot().online) {
    throw new Error('ESP32 hors ligne');
  }

  runtimeState.device.lastCommand = {
    ...command,
    topic: null,
    channel: 'http-poll',
  };
  broadcastEvent('device', buildDeviceSnapshot());

  return {
    delivered: true,
    channel: 'http-poll',
    topic: null,
  };
}

async function executeActuatorChange(device, nextState, source = 'dashboard', automationNote = null) {
  const current = runtimeState.actuators[device];
  if (!current) {
    throw new Error('Unknown actuator');
  }

  const now = new Date();
  const timestamp = now.toISOString();
  const manualUntil = source === 'dashboard' && runtimeState.automation.enabled
    ? new Date(now.getTime() + runtimeState.automation.manualHoldMinutes * 60 * 1000).toISOString()
    : null;
  const updated = {
    state: nextState,
    mode: source === 'dashboard' ? 'manual' : 'auto',
    lastChanged: timestamp,
    manualUntil,
    automationNote: source === 'automation' ? automationNote : null,
  };

  const delivery = await dispatchActuatorCommand(device, updated);
  await persistActuatorAndDevice(device, updated, source, delivery);
  if (source === 'automation') {
    runtimeState.automationStatus.lastActionAt = timestamp;
    runtimeState.automationStatus.lastAction = {
      device,
      state: nextState,
      reason: automationNote,
    };
    broadcastAutomationSnapshot();
  }

  return {
    actuator: updated,
    delivery,
  };
}

async function evaluateAutomation(metric) {
  runtimeState.automationStatus.lastEvaluatedAt = new Date().toISOString();
  broadcastAutomationSnapshot();

  if (!metric || !runtimeState.automation.enabled) {
    return;
  }

  const actions = [];
  const settings = runtimeState.automation;
  const now = Date.now();

  if (settings.heater.enabled && !isManualHoldActive(runtimeState.actuators.heater)) {
    if (metric.temperature <= settings.heater.minTemp && runtimeState.actuators.heater.state !== 'on') {
      actions.push({ device: 'heater', state: 'on', reason: `temperature basse ${metric.temperature}C` });
    }
    if (metric.temperature >= settings.heater.maxTemp && runtimeState.actuators.heater.state !== 'off') {
      actions.push({ device: 'heater', state: 'off', reason: `temperature haute ${metric.temperature}C` });
    }
  }

  if (settings.pump.enabled && !isManualHoldActive(runtimeState.actuators.pump)) {
    let desiredPumpState = null;
    let pumpReason = null;

    if (metric.water_level <= settings.pump.lowLevelCutoff) {
      desiredPumpState = 'off';
      pumpReason = `niveau bas ${metric.water_level}%`;
    } else if (metric.turbidity >= settings.pump.turbidityStart) {
      desiredPumpState = 'on';
      pumpReason = `turbidite haute ${metric.turbidity} NTU`;
    } else if (metric.turbidity <= settings.pump.turbidityStop) {
      const cycleOnMs = settings.pump.cycleOnMinutes * 60 * 1000;
      const cycleOffMs = settings.pump.cycleOffMinutes * 60 * 1000;
      const cyclePeriod = cycleOnMs + cycleOffMs;
      const phase = cyclePeriod > 0 ? now % cyclePeriod : 0;
      desiredPumpState = phase < cycleOnMs ? 'on' : 'off';
      pumpReason = phase < cycleOnMs
        ? `cycle recyclage ${settings.pump.cycleOnMinutes} min`
        : `pause recyclage ${settings.pump.cycleOffMinutes} min`;
    }

    if (desiredPumpState && runtimeState.actuators.pump.state !== desiredPumpState) {
      actions.push({ device: 'pump', state: desiredPumpState, reason: pumpReason });
    }
  }

  for (const action of actions) {
    try {
      await executeActuatorChange(action.device, action.state, 'automation', action.reason);
    } catch (error) {
      runtimeState.automationStatus.lastActionAt = new Date().toISOString();
      runtimeState.automationStatus.lastAction = {
        device: action.device,
        state: action.state,
        reason: `echec: ${error.message}`,
      };
      broadcastAutomationSnapshot();
    }
  }
}

async function buildSystemSnapshot() {
  const info = await store.info();
  return {
    backend: store.backend,
    historyLimit: store.historyLimit,
    note: store.note || null,
    mqtt: {
      ...mqttStatus,
      connected: Boolean(mqttClient && mqttClient.connected),
    },
    ...info,
  };
}

async function buildDashboardPayload() {
  const history = await store.getHistory(DASHBOARD_HISTORY_LIMIT);
  return {
    history,
    latestMetric: history.length ? history[history.length - 1] : null,
    thresholds: runtimeState.thresholds,
    actuators: runtimeState.actuators,
    alerts: runtimeState.alerts.slice(-DASHBOARD_ALERT_LIMIT),
    logs: runtimeState.logs.slice(-DASHBOARD_LOG_LIMIT),
    notifications: buildNotificationSnapshot(),
    automation: buildAutomationSnapshot(),
    system: await buildSystemSnapshot(),
    device: buildDeviceSnapshot(),
  };
}

function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');

  const client = { res };
  eventClients.add(client);

  Promise.all([buildSystemSnapshot(), Promise.resolve(buildDeviceSnapshot())])
    .then(([system, device]) => {
      res.write(`event: system\ndata: ${JSON.stringify(system)}\n\n`);
      res.write(`event: device\ndata: ${JSON.stringify(device)}\n\n`);
      res.write(`event: notifications\ndata: ${JSON.stringify(buildNotificationSnapshot())}\n\n`);
      res.write(`event: automation\ndata: ${JSON.stringify(buildAutomationSnapshot())}\n\n`);
    })
    .catch(() => {});

  req.on('close', () => {
    eventClients.delete(client);
  });
}

async function handleApi(req, res, urlObj) {
  const parts = urlObj.pathname.replace('/api/v1', '').split('/').filter(Boolean);
  const resource = parts[0];

  if (resource === 'events' && req.method === 'GET') {
    if (!requireAuth(req, res)) {
      return;
    }
    handleEvents(req, res);
    return;
  }

  if (resource === 'dashboard' && req.method === 'GET') {
    if (!requireAuth(req, res)) {
      return;
    }
    sendJson(res, 200, await buildDashboardPayload());
    return;
  }

  if (resource === 'auth') {
    if (req.method === 'GET' && parts[1] === 'me') {
      const user = getSessionUser(req);
      sendJson(res, 200, { user: user || { role: 'visitor' } });
      return;
    }

    if (req.method === 'POST' && parts[1] === 'login') {
      try {
        const payload = await parseBody(req);
        const username = String(payload.username || '').trim();
        const password = String(payload.password || '');
        if (!username || !password) {
          sendJson(res, 400, { error: 'Missing credentials' });
          return;
        }

        if (username === ADMIN_USER && password === ADMIN_PASS) {
          createSession(res, { username, role: 'admin' });
          sendJson(res, 200, { status: 'ok', user: { username, role: 'admin' } });
          return;
        }

        if (username === TECH_USER && password === TECH_PASS) {
          createSession(res, { username, role: 'technician' });
          sendJson(res, 200, { status: 'ok', user: { username, role: 'technician' } });
          return;
        }

        sendJson(res, 401, { error: 'Invalid credentials' });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && parts[1] === 'logout') {
      clearSession(req, res);
      sendJson(res, 200, { status: 'ok' });
      return;
    }
  }

  if (resource === 'system' && req.method === 'GET') {
    if (!requireAuth(req, res)) {
      return;
    }
    sendJson(res, 200, await buildSystemSnapshot());
    return;
  }

  if (resource === 'notifications') {
    if (req.method === 'GET') {
      if (!requireAuth(req, res)) {
        return;
      }
      sendJson(res, 200, buildNotificationSnapshot());
      return;
    }

    if (req.method === 'POST' && parts[1] === 'test') {
      if (!requireAdmin(req, res)) {
        return;
      }

      try {
        if (!runtimeState.notifications.email.enabled) {
          throw new Error('Alertes email desactivees');
        }
        if (!runtimeState.notifications.email.to) {
          throw new Error('Adresse email manquante');
        }
        if (!getEmailTransporter()) {
          throw new Error('SMTP non configure');
        }

        await sendAlertEmails([{
          id: `test_${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'system',
          severity: 'warning',
          message: 'Email de test Projet E6',
        }]);

        sendJson(res, 200, { status: 'ok' });
      } catch (error) {
        runtimeState.notificationStatus.lastEmailError = error.message;
        broadcastNotificationSnapshot();
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) {
        return;
      }

      try {
        const payload = await parseBody(req);
        runtimeState.notifications = normalizeNotificationSettings(payload);
        await writeJson(paths.notifications, runtimeState.notifications);
        runtimeState.notificationStatus.emailConfigured = isEmailConfigured();
        runtimeState.notificationStatus.lastEmailError = null;
        broadcastNotificationSnapshot();
        sendJson(res, 200, buildNotificationSnapshot());
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'device' && req.method === 'GET') {
    if (parts[1] === 'desired-state') {
      sendJson(res, 200, {
        deviceId: runtimeState.device.deviceId,
        updatedAt: new Date().toISOString(),
        pumpState: runtimeState.actuators.pump.state,
        pumpMode: runtimeState.actuators.pump.mode,
        heaterState: runtimeState.actuators.heater.state,
        heaterMode: runtimeState.actuators.heater.mode,
        actuators: runtimeState.actuators,
        automation: buildAutomationSnapshot(),
      });
      return;
    }

    sendJson(res, 200, buildDeviceSnapshot());
    return;
  }

  if (resource === 'metrics') {
    if (req.method === 'GET' && parts[1] === 'latest') {
      if (!requireAuth(req, res)) {
        return;
      }
      const metric = await store.getLatestMetric();
      if (!metric) {
        sendJson(res, 200, { status: 'empty' });
        return;
      }
      sendJson(res, 200, metric);
      return;
    }

    if (req.method === 'GET' && parts[1] === 'history') {
      if (!requireAuth(req, res)) {
        return;
      }
      const limit = sanitizeLimit(urlObj.searchParams.get('limit'), DASHBOARD_HISTORY_LIMIT);
      const items = await store.getHistory(limit);
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'POST' && !parts[1]) {
      try {
        const payload = await parseBody(req);
        const metric = normalizeMetricPayload(payload);
        await store.addMetric(metric);
        const newAlerts = updateAlerts(metric);
        dispatchAlertNotifications(newAlerts);
        const metadata = extractDeviceMetadata(payload, metric.timestamp);
        if (metadata) {
          applyDeviceState(metadata, 'http');
        }
        await evaluateAutomation(metric);
        broadcastEvent('metric', { metric });
        sendJson(res, 201, { status: 'ok', metric });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'thresholds') {
    if (req.method === 'GET') {
      if (!requireAuth(req, res)) {
        return;
      }
      sendJson(res, 200, runtimeState.thresholds);
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) {
        return;
      }
      try {
        const payload = await parseBody(req);
        const normalized = normalizeThresholds(payload);
        runtimeState.thresholds = normalized;
        await writeJson(paths.thresholds, normalized);
        broadcastEvent('thresholds', normalized);
        await evaluateAutomation(await store.getLatestMetric());
        sendJson(res, 200, { status: 'ok', thresholds: normalized });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'automation') {
    if (req.method === 'GET') {
      if (!requireAuth(req, res)) {
        return;
      }
      sendJson(res, 200, buildAutomationSnapshot());
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) {
        return;
      }
      try {
        const payload = await parseBody(req);
        runtimeState.automation = normalizeAutomationSettings(payload);
        await writeJson(paths.automation, runtimeState.automation);
        broadcastAutomationSnapshot();
        await evaluateAutomation(await store.getLatestMetric());
        sendJson(res, 200, buildAutomationSnapshot());
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'actuators') {
    const device = parts[1];

    if (req.method === 'GET' && !device) {
      if (!requireAuth(req, res)) {
        return;
      }
      sendJson(res, 200, runtimeState.actuators);
      return;
    }

    if (!['pump', 'heater'].includes(device)) {
      sendJson(res, 404, { error: 'Unknown actuator' });
      return;
    }

    if (req.method === 'GET') {
      if (!requireAuth(req, res)) {
        return;
      }
      sendJson(res, 200, runtimeState.actuators[device]);
      return;
    }

    if (req.method === 'POST') {
      if (!requireAdmin(req, res)) {
        return;
      }
      try {
        const payload = await parseBody(req);
        const current = runtimeState.actuators[device];
        const nextState = payload.state === 'on' ? 'on' : payload.state === 'off' ? 'off' : current.state;
        const result = await executeActuatorChange(device, nextState, 'dashboard');
        broadcastAutomationSnapshot();

        sendJson(res, 200, {
          status: 'ok',
          actuator: result.actuator,
          delivery: result.delivery,
        });
      } catch (error) {
        sendJson(res, 503, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'alerts' && req.method === 'GET') {
    if (!requireAuth(req, res)) {
      return;
    }
    const limit = sanitizeLimit(urlObj.searchParams.get('limit'), DASHBOARD_ALERT_LIMIT);
    sendJson(res, 200, { items: runtimeState.alerts.slice(-limit) });
    return;
  }

  if (resource === 'logs' && req.method === 'GET' && parts[1] === 'actuators') {
    if (!requireAuth(req, res)) {
      return;
    }
    const limit = sanitizeLimit(urlObj.searchParams.get('limit'), DASHBOARD_LOG_LIMIT);
    sendJson(res, 200, { items: runtimeState.logs.slice(-limit) });
    return;
  }

  sendJson(res, 404, { error: 'Unknown endpoint' });
}

function setupMqtt() {
  if (!MQTT_ENABLED) {
    return;
  }

  mqttStatus.enabled = true;
  mqttClient = mqtt.connect(MQTT_URL, {
    clientId: MQTT_CLIENT_ID,
    reconnectPeriod: 5000,
  });

  mqttClient.on('connect', () => {
    mqttStatus.connected = true;
    mqttStatus.error = null;
    mqttClient.subscribe([MQTT_METRICS_TOPIC, MQTT_STATE_TOPIC], { qos: 0 }, (error) => {
      if (error) {
        mqttStatus.error = error.message;
        console.error('MQTT subscribe error:', error.message);
      }
    });
    console.log(`MQTT connected: ${MQTT_URL} (metrics: ${MQTT_METRICS_TOPIC}, state: ${MQTT_STATE_TOPIC})`);
    broadcastSystemSnapshot().catch(() => {});
  });

  mqttClient.on('reconnect', () => {
    mqttStatus.connected = false;
    broadcastSystemSnapshot().catch(() => {});
  });

  mqttClient.on('close', () => {
    mqttStatus.connected = false;
    broadcastSystemSnapshot().catch(() => {});
  });

  mqttClient.on('offline', () => {
    mqttStatus.connected = false;
    broadcastSystemSnapshot().catch(() => {});
  });

  mqttClient.on('error', (error) => {
    const message = error && error.message ? error.message : String(error || 'Unknown error');
    mqttStatus.error = message;
    mqttStatus.connected = false;
    const now = Date.now();
    if (mqttLastLog.message !== message || now - mqttLastLog.time > 15000) {
      console.error('MQTT error:', message);
      mqttLastLog = { message, time: now };
    }
    broadcastSystemSnapshot().catch(() => {});
  });

  mqttClient.on('message', async (topic, payload) => {
    try {
      const text = payload.toString('utf8');
      const data = JSON.parse(text);

      if (topic === MQTT_METRICS_TOPIC) {
        const metric = normalizeMetricPayload(data);
        await store.addMetric(metric);
        const newAlerts = updateAlerts(metric);
        dispatchAlertNotifications(newAlerts);
        mqttStatus.lastMessage = metric.timestamp;

        const metadata = extractDeviceMetadata(data, metric.timestamp);
        if (metadata) {
          applyDeviceState(metadata, 'mqtt-metric');
        }

        await evaluateAutomation(metric);
        broadcastEvent('metric', { metric });
        return;
      }

      if (topic === MQTT_STATE_TOPIC) {
        const statePayload = normalizeStatePayload(data);
        mqttStatus.lastState = statePayload.lastState;
        applyDeviceState(statePayload, 'mqtt-state');
      }
    } catch (error) {
      mqttStatus.error = `MQTT message error: ${error.message}`;
      broadcastSystemSnapshot().catch(() => {});
    }
  });
}

async function startServer() {
  ensureSeed();
  loadRuntimeState();

  store = await createStore({
    storageDir: STORAGE_DIR,
    metricsPath: paths.metrics,
    seedFn: seedMetrics,
    historyLimit: HISTORY_LIMIT,
  });

  const server = http.createServer((req, res) => {
    Promise.resolve()
      .then(async () => {
        const urlObj = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
        if (urlObj.pathname.startsWith('/api/v1')) {
          await handleApi(req, res, urlObj);
          return;
        }
        serveStatic(req, res, urlObj.pathname);
      })
      .catch((error) => {
        console.error('Request error:', error);
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Internal server error' });
          return;
        }
        res.end();
      });
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  setInterval(() => {
    for (const client of eventClients) {
      client.res.write(': keepalive\n\n');
    }
  }, 25000).unref();

  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (session.expiresAt <= now) {
        sessions.delete(id);
      }
    }
  }, 10 * 60 * 1000).unref();

  setupMqtt();
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
