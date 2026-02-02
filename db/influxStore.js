function createInfluxStore({ historyLimit = 120 }) {
  let influx;
  let client;
  let writeApi;
  let queryApi;

  const ensureDependency = () => {
    try {
      influx = require('@influxdata/influxdb-client');
    } catch (error) {
      throw new Error('Missing dependency @influxdata/influxdb-client. Run: npm install');
    }
  };

  const config = () => ({
    url: process.env.INFLUX_URL || 'http://localhost:8086',
    token: process.env.INFLUX_TOKEN || '',
    org: process.env.INFLUX_ORG || 'projet-e6',
    bucket: process.env.INFLUX_BUCKET || 'aquaculture',
    range: process.env.INFLUX_RANGE || '-30d',
  });

  const normalizeRow = (row) => ({
    timestamp: row._time,
    temperature: Number(row.temperature),
    ph: Number(row.ph),
    turbidity: Number(row.turbidity),
    water_level: Number(row.water_level),
    humidity: Number(row.humidity),
  });

  return {
    backend: 'influx',
    historyLimit,
    async init() {
      ensureDependency();
      const cfg = config();
      if (!cfg.token) {
        throw new Error('INFLUX_TOKEN is required');
      }
      const { InfluxDB } = influx;
      client = new InfluxDB({ url: cfg.url, token: cfg.token });
      writeApi = client.getWriteApi(cfg.org, cfg.bucket, 'ms');
      queryApi = client.getQueryApi(cfg.org);
    },
    async getHistory(limit) {
      const cfg = config();
      const safeLimit = !limit || limit <= 0 ? historyLimit : limit;
      const query = `from(bucket: "${cfg.bucket}")
        |> range(start: ${cfg.range})
        |> filter(fn: (r) => r._measurement == "water_metrics")
        |> pivot(rowKey:["_time"], columnKey:["_field"], valueColumn:"_value")
        |> sort(columns:["_time"], desc:true)
        |> limit(n:${safeLimit})`;
      const rows = await queryApi.collectRows(query);
      return rows.map(normalizeRow).reverse();
    },
    async getLatestMetric() {
      const items = await this.getHistory(1);
      return items.length ? items[items.length - 1] : null;
    },
    async addMetric(metric) {
      const cfg = config();
      const { Point } = influx;
      const point = new Point('water_metrics')
        .floatField('temperature', metric.temperature)
        .floatField('ph', metric.ph)
        .floatField('turbidity', metric.turbidity)
        .floatField('water_level', metric.water_level)
        .floatField('humidity', metric.humidity)
        .timestamp(new Date(metric.timestamp));
      writeApi.writePoint(point);
      await writeApi.flush();
    },
    async info() {
      const cfg = config();
      return {
        backend: 'influx',
        engine: 'InfluxDB',
        ok: true,
        message: `Bucket: ${cfg.bucket} @ ${cfg.url}`,
      };
    },
  };
}

module.exports = {
  createInfluxStore,
};
