function createPostgresStore({ seedFn, historyLimit = 120 }) {
  let pool;
  let pg;

  const ensureDependency = () => {
    try {
      pg = require('pg');
    } catch (error) {
      throw new Error('Missing dependency pg. Run: npm install');
    }
  };

  const connectionConfig = () => {
    if (process.env.PG_URL) {
      return { connectionString: process.env.PG_URL };
    }
    return {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || 'postgres',
      database: process.env.PGDATABASE || 'projet_e6',
    };
  };

  const normalizeRow = (row) => ({
    timestamp: row.timestamp,
    temperature: Number(row.temperature),
    ph: Number(row.ph),
    turbidity: Number(row.turbidity),
    water_level: Number(row.water_level),
    humidity: Number(row.humidity),
  });

  return {
    backend: 'postgres',
    historyLimit,
    async init() {
      ensureDependency();
      const { Pool } = pg;
      pool = new Pool(connectionConfig());
      await pool.query(`CREATE TABLE IF NOT EXISTS metrics (
        timestamp TIMESTAMPTZ PRIMARY KEY,
        temperature DOUBLE PRECISION,
        ph DOUBLE PRECISION,
        turbidity DOUBLE PRECISION,
        water_level DOUBLE PRECISION,
        humidity DOUBLE PRECISION
      )`);
      const result = await pool.query('SELECT COUNT(*) as count FROM metrics');
      const count = Number(result.rows[0]?.count || 0);
      if (count === 0 && seedFn) {
        const seed = seedFn();
        for (const item of seed) {
          await pool.query(
            'INSERT INTO metrics (timestamp, temperature, ph, turbidity, water_level, humidity) VALUES ($1, $2, $3, $4, $5, $6)',
            [item.timestamp, item.temperature, item.ph, item.turbidity, item.water_level, item.humidity]
          );
        }
      }
    },
    async getHistory(limit) {
      const safeLimit = !limit || limit <= 0 ? historyLimit : limit;
      const result = await pool.query(
        'SELECT timestamp, temperature, ph, turbidity, water_level, humidity FROM metrics ORDER BY timestamp DESC LIMIT $1',
        [safeLimit]
      );
      return result.rows.map(normalizeRow).reverse();
    },
    async getLatestMetric() {
      const result = await pool.query(
        'SELECT timestamp, temperature, ph, turbidity, water_level, humidity FROM metrics ORDER BY timestamp DESC LIMIT 1'
      );
      const row = result.rows[0];
      return row ? normalizeRow(row) : null;
    },
    async addMetric(metric) {
      await pool.query(
        'INSERT INTO metrics (timestamp, temperature, ph, turbidity, water_level, humidity) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (timestamp) DO UPDATE SET temperature = EXCLUDED.temperature, ph = EXCLUDED.ph, turbidity = EXCLUDED.turbidity, water_level = EXCLUDED.water_level, humidity = EXCLUDED.humidity',
        [metric.timestamp, metric.temperature, metric.ph, metric.turbidity, metric.water_level, metric.humidity]
      );
    },
    async info() {
      return {
        backend: 'postgres',
        engine: 'PostgreSQL',
        ok: true,
        message: 'Connected to Postgres',
      };
    },
  };
}

module.exports = {
  createPostgresStore,
};
