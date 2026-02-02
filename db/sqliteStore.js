const path = require('path');

function createSqliteStore({ dbPath, seedFn, historyLimit = 120 }) {
  let db;
  let sqlite;

  const ensureDependency = () => {
    try {
      sqlite = require('sqlite3').verbose();
    } catch (error) {
      throw new Error('Missing dependency sqlite3. Run: npm install');
    }
  };

  const run = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function handle(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });

  const get = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });

  const all = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });

  const normalizeRow = (row) => ({
    timestamp: row.timestamp,
    temperature: Number(row.temperature),
    ph: Number(row.ph),
    turbidity: Number(row.turbidity),
    water_level: Number(row.water_level),
    humidity: Number(row.humidity),
  });

  return {
    backend: 'sqlite',
    historyLimit,
    async init() {
      ensureDependency();
      const dir = path.dirname(dbPath);
      if (!require('fs').existsSync(dir)) {
        require('fs').mkdirSync(dir, { recursive: true });
      }
      db = new sqlite.Database(dbPath);
      await run(`CREATE TABLE IF NOT EXISTS metrics (
        timestamp TEXT PRIMARY KEY,
        temperature REAL,
        ph REAL,
        turbidity REAL,
        water_level REAL,
        humidity REAL
      )`);
      const row = await get('SELECT COUNT(*) as count FROM metrics');
      if (row && row.count === 0 && seedFn) {
        const seed = seedFn();
        for (const item of seed) {
          await run(
            'INSERT INTO metrics (timestamp, temperature, ph, turbidity, water_level, humidity) VALUES (?, ?, ?, ?, ?, ?)',
            [item.timestamp, item.temperature, item.ph, item.turbidity, item.water_level, item.humidity]
          );
        }
      }
    },
    async getHistory(limit) {
      const safeLimit = !limit || limit <= 0 ? historyLimit : limit;
      const rows = await all(
        'SELECT timestamp, temperature, ph, turbidity, water_level, humidity FROM metrics ORDER BY timestamp DESC LIMIT ?',
        [safeLimit]
      );
      return rows.map(normalizeRow).reverse();
    },
    async getLatestMetric() {
      const row = await get(
        'SELECT timestamp, temperature, ph, turbidity, water_level, humidity FROM metrics ORDER BY timestamp DESC LIMIT 1'
      );
      return row ? normalizeRow(row) : null;
    },
    async addMetric(metric) {
      await run(
        'INSERT OR REPLACE INTO metrics (timestamp, temperature, ph, turbidity, water_level, humidity) VALUES (?, ?, ?, ?, ?, ?)',
        [metric.timestamp, metric.temperature, metric.ph, metric.turbidity, metric.water_level, metric.humidity]
      );
    },
    async info() {
      return {
        backend: 'sqlite',
        engine: 'SQLite',
        ok: true,
        message: `DB path: ${dbPath}`,
      };
    },
  };
}

module.exports = {
  createSqliteStore,
};
