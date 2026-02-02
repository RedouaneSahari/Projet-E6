const fs = require('fs');
const path = require('path');

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

function createJsonStore({ metricsPath, seedFn, historyLimit = 120 }) {
  const pathToFile = metricsPath;

  return {
    backend: 'json',
    historyLimit,
    async init() {
      const dir = path.dirname(pathToFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(pathToFile)) {
        const seed = seedFn ? seedFn() : [];
        writeJson(pathToFile, seed);
      }
    },
    async getHistory(limit) {
      const history = readJson(pathToFile, []);
      if (!limit || limit <= 0) {
        return history;
      }
      return history.slice(-limit);
    },
    async getLatestMetric() {
      const history = readJson(pathToFile, []);
      return history.length ? history[history.length - 1] : null;
    },
    async addMetric(metric) {
      const history = readJson(pathToFile, []);
      history.push(metric);
      const trimmed = historyLimit > 0 ? history.slice(-historyLimit) : history;
      writeJson(pathToFile, trimmed);
    },
    async info() {
      return {
        backend: 'json',
        engine: 'Local JSON',
        ok: true,
        message: `Storage file: ${pathToFile}`,
      };
    },
  };
}

module.exports = {
  createJsonStore,
};
