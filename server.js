const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STORAGE_DIR = path.join(__dirname, 'storage');
const LOG_DIR = path.join(STORAGE_DIR, 'logs');

const paths = {
  metrics: path.join(STORAGE_DIR, 'metrics.json'),
  thresholds: path.join(STORAGE_DIR, 'thresholds.json'),
  actuators: path.join(STORAGE_DIR, 'actuators.json'),
  alerts: path.join(STORAGE_DIR, 'alerts.json'),
  log: path.join(LOG_DIR, 'actuators.log'),
};

const DEFAULT_THRESHOLDS = {
  temperature: { min: 22.0, max: 28.0, unit: 'C' },
  ph: { min: 6.8, max: 7.8 },
  turbidity: { max: 22.0, unit: 'NTU' },
  water_level: { min: 60.0, max: 90.0, unit: '%' },
  humidity: { min: 35.0, max: 70.0, unit: '%' },
};

const DEFAULT_ACTUATORS = {
  pump: { state: 'off', mode: 'auto', lastChanged: new Date().toISOString() },
  heater: { state: 'off', mode: 'auto', lastChanged: new Date().toISOString() },
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) {
      return fallback;
    }
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, `${payload}\n`, 'utf8');
}

function ensureSeed() {
  ensureDir(STORAGE_DIR);
  ensureDir(LOG_DIR);

  if (!fs.existsSync(paths.thresholds)) {
    writeJson(paths.thresholds, DEFAULT_THRESHOLDS);
  }

  if (!fs.existsSync(paths.actuators)) {
    writeJson(paths.actuators, DEFAULT_ACTUATORS);
  }

  if (!fs.existsSync(paths.alerts)) {
    writeJson(paths.alerts, []);
  }

  if (!fs.existsSync(paths.metrics)) {
    writeJson(paths.metrics, seedMetrics());
  }

  if (!fs.existsSync(paths.log)) {
    fs.writeFileSync(paths.log, '', 'utf8');
  }
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

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function generateMetric(last) {
  const base = {
    temperature: 24.0,
    ph: 7.2,
    turbidity: 14.0,
    water_level: 78.0,
    humidity: 52.0,
    ...last,
  };
  const next = {
    timestamp: new Date().toISOString(),
    temperature: clamp(base.temperature + rand(-0.4, 0.5), 20.0, 30.0),
    ph: clamp(base.ph + rand(-0.06, 0.06), 6.5, 8.2),
    turbidity: clamp(base.turbidity + rand(-1.2, 1.4), 6.0, 35.0),
    water_level: clamp(base.water_level + rand(-1.6, 1.2), 40.0, 95.0),
    humidity: clamp(base.humidity + rand(-2.2, 2.0), 30.0, 80.0),
  };

  return {
    ...next,
    temperature: round(next.temperature, 1),
    ph: round(next.ph, 2),
    turbidity: round(next.turbidity, 1),
    water_level: round(next.water_level, 1),
    humidity: round(next.humidity, 1),
  };
}

function updateAlerts(metric) {
  const thresholds = readJson(paths.thresholds, DEFAULT_THRESHOLDS);
  const alerts = readJson(paths.alerts, []);
  const now = new Date().toISOString();
  const cooldownMs = 5 * 60 * 1000;

  const checks = [
    { key: 'temperature', label: 'Temperature' },
    { key: 'ph', label: 'pH' },
    { key: 'turbidity', label: 'Turbidity' },
    { key: 'water_level', label: 'Water level' },
    { key: 'humidity', label: 'Humidity' },
  ];

  const newAlerts = [];

  checks.forEach((check) => {
    const entry = thresholds[check.key] || {};
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
      message: `${check.label} is ${direction} (${value})`,
    });
  });

  if (newAlerts.length) {
    const merged = alerts.concat(newAlerts).slice(-200);
    writeJson(paths.alerts, merged);
  }
}

function findLastAlert(alerts, type) {
  for (let i = alerts.length - 1; i >= 0; i -= 1) {
    if (alerts[i].type === type) {
      return alerts[i];
    }
  }
  return null;
}

function appendLog(line) {
  fs.appendFileSync(paths.log, `${line}\n`, 'utf8');
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function serveStatic(res, pathname) {
  const safePath = decodeURIComponent(pathname);
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (safePath === '/' || safePath === '') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, urlObj) {
  const parts = urlObj.pathname.replace('/api/v1', '').split('/').filter(Boolean);
  const resource = parts[0];

  if (resource === 'metrics') {
    if (req.method === 'GET' && parts[1] === 'latest') {
      const history = readJson(paths.metrics, seedMetrics());
      const last = history[history.length - 1] || seedMetrics().slice(-1)[0];
      const metric = generateMetric(last);
      history.push(metric);
      const trimmed = history.slice(-120);
      writeJson(paths.metrics, trimmed);
      updateAlerts(metric);
      sendJson(res, 200, metric);
      return;
    }

    if (req.method === 'GET' && parts[1] === 'history') {
      const history = readJson(paths.metrics, []);
      const limit = Number(urlObj.searchParams.get('limit') || 60);
      const items = limit > 0 ? history.slice(-limit) : history;
      sendJson(res, 200, { items });
      return;
    }
  }

  if (resource === 'thresholds') {
    if (req.method === 'GET') {
      const thresholds = readJson(paths.thresholds, DEFAULT_THRESHOLDS);
      sendJson(res, 200, thresholds);
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = await parseBody(req);
        const normalized = normalizeThresholds(payload);
        writeJson(paths.thresholds, normalized);
        sendJson(res, 200, { status: 'ok', thresholds: normalized });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'actuators') {
    const device = parts[1];
    if (!['pump', 'heater'].includes(device)) {
      sendJson(res, 404, { error: 'Unknown actuator' });
      return;
    }

    const actuators = readJson(paths.actuators, DEFAULT_ACTUATORS);
    if (req.method === 'GET') {
      sendJson(res, 200, actuators[device]);
      return;
    }

    if (req.method === 'POST') {
      try {
        const payload = await parseBody(req);
        const state = payload.state === 'on' ? 'on' : payload.state === 'off' ? 'off' : actuators[device].state;
        const mode = payload.mode === 'manual' ? 'manual' : payload.mode === 'auto' ? 'auto' : actuators[device].mode;
        const updated = {
          state,
          mode,
          lastChanged: new Date().toISOString(),
        };
        actuators[device] = updated;
        writeJson(paths.actuators, actuators);
        appendLog(`${updated.lastChanged}\t${device}\t${state}\t${mode}`);
        sendJson(res, 200, { status: 'ok', actuator: updated });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }
  }

  if (resource === 'alerts' && req.method === 'GET') {
    const alerts = readJson(paths.alerts, []);
    const limit = Number(urlObj.searchParams.get('limit') || 50);
    const items = limit > 0 ? alerts.slice(-limit) : alerts;
    sendJson(res, 200, { items });
    return;
  }

  if (resource === 'logs' && req.method === 'GET' && parts[1] === 'actuators') {
    if (!fs.existsSync(paths.log)) {
      sendJson(res, 200, { items: [] });
      return;
    }
    const raw = fs.readFileSync(paths.log, 'utf8');
    const items = raw.trim() ? raw.trim().split('\n').slice(-80) : [];
    sendJson(res, 200, { items });
    return;
  }

  sendJson(res, 404, { error: 'Unknown endpoint' });
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

ensureSeed();

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname.startsWith('/api/v1')) {
    await handleApi(req, res, urlObj);
    return;
  }
  serveStatic(res, urlObj.pathname);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
