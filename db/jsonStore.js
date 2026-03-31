const fs = require('fs');
const fsPromises = require('fs/promises');
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

function createJsonStore({ metricsPath, seedFn, historyLimit = 120 }) {
  const pathToFile = metricsPath;
  let history = [];
  let writeChain = Promise.resolve();
  let flushTimer = null;
  let dirty = false;

  const queuePersist = () => {
    if (flushTimer) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (!dirty) {
        return;
      }

      dirty = false;
      const snapshot = history.slice();
      const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
      writeChain = writeChain
        .catch(() => {})
        .then(() => fsPromises.writeFile(pathToFile, payload, 'utf8'))
        .catch(() => {
          dirty = true;
        });
    }, 150);
  };

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
        history = historyLimit > 0 ? seed.slice(-historyLimit) : seed.slice();
        await fsPromises.writeFile(pathToFile, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
        return;
      }

      const loaded = readJson(pathToFile, []);
      history = Array.isArray(loaded) ? loaded.slice(-historyLimit || undefined) : [];
    },
    async getHistory(limit) {
      if (!limit || limit <= 0) {
        return history.slice();
      }
      return history.slice(-limit);
    },
    async getLatestMetric() {
      return history.length ? history[history.length - 1] : null;
    },
    async addMetric(metric) {
      history.push(metric);
      if (historyLimit > 0 && history.length > historyLimit) {
        history = history.slice(-historyLimit);
      }
      dirty = true;
      queuePersist();
    },
    async info() {
      return {
        backend: 'json',
        engine: 'Local JSON',
        ok: true,
        message: `Storage file: ${pathToFile} (cache memoire actif)`,
      };
    },
  };
}

module.exports = {
  createJsonStore,
};
