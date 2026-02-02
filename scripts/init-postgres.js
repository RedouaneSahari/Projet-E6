const fs = require('fs');
const path = require('path');

function getConfig() {
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
}

async function main() {
  let pg;
  try {
    pg = require('pg');
  } catch (error) {
    console.error('Missing dependency pg. Run: npm install');
    process.exit(1);
  }

  const sqlPath = path.join(__dirname, '..', 'database', 'postgres.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new pg.Client(getConfig());
  await client.connect();
  await client.query(sql);
  await client.end();

  console.log('Postgres schema applied successfully.');
}

main().catch((error) => {
  console.error('Postgres init failed:', error.message);
  process.exit(1);
});
