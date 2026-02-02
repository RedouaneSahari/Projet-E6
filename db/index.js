const path = require('path');
const { createJsonStore } = require('./jsonStore');
const { createSqliteStore } = require('./sqliteStore');
const { createPostgresStore } = require('./postgresStore');
const { createInfluxStore } = require('./influxStore');

async function createStore(options) {
  const backend = (process.env.DATA_BACKEND || 'json').toLowerCase();
  const strict = process.env.DATA_STRICT === '1';

  const config = {
    ...options,
    backend,
  };

  const attempt = async (type) => {
    switch (type) {
      case 'sqlite':
        return createSqliteStore({
          ...config,
          dbPath: process.env.SQLITE_PATH || path.join(config.storageDir, 'metrics.sqlite'),
        });
      case 'postgres':
        return createPostgresStore(config);
      case 'influx':
        return createInfluxStore(config);
      case 'json':
      default:
        return createJsonStore(config);
    }
  };

  try {
    const store = await attempt(backend);
    await store.init();
    return store;
  } catch (error) {
    if (strict) {
      throw error;
    }
    const fallback = await attempt('json');
    await fallback.init();
    fallback.note = `Fallback to JSON: ${error.message}`;
    return fallback;
  }
}

module.exports = {
  createStore,
};
