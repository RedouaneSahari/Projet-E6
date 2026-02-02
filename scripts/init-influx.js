const { URL } = require('url');

function getEnv(key, fallback) {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : fallback;
}

function parseDuration(input) {
  if (!input || input === '0') {
    return null;
  }
  const match = String(input).trim().match(/^(\d+)([smhdw])$/i);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  return value * (multipliers[unit] || 0);
}

async function apiRequest(url, method, token, body) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${url} failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function main() {
  const baseUrl = getEnv('INFLUX_URL', 'http://localhost:8086');
  const token = getEnv('INFLUX_TOKEN', '');
  const orgName = getEnv('INFLUX_ORG', 'projet-e6');
  const bucketName = getEnv('INFLUX_BUCKET', 'aquaculture');
  const retentionInput = getEnv('INFLUX_RETENTION', '30d');

  if (!token) {
    console.error('INFLUX_TOKEN is required');
    process.exit(1);
  }

  const orgsUrl = new URL('/api/v2/orgs', baseUrl);
  orgsUrl.searchParams.set('org', orgName);
  const orgs = await apiRequest(orgsUrl.toString(), 'GET', token);
  let org = orgs.orgs && orgs.orgs.length ? orgs.orgs[0] : null;

  if (!org) {
    const created = await apiRequest(orgsUrl.toString(), 'POST', token, { name: orgName });
    org = created;
    console.log(`Created org: ${orgName}`);
  }

  const bucketsUrl = new URL('/api/v2/buckets', baseUrl);
  bucketsUrl.searchParams.set('name', bucketName);
  const buckets = await apiRequest(bucketsUrl.toString(), 'GET', token);
  let bucket = buckets.buckets && buckets.buckets.length ? buckets.buckets[0] : null;

  if (!bucket) {
    const retentionSeconds = parseDuration(retentionInput);
    const payload = {
      orgID: org.id,
      name: bucketName,
    };
    if (retentionSeconds) {
      payload.retentionRules = [{ type: 'expire', everySeconds: retentionSeconds }];
    }
    bucket = await apiRequest(bucketsUrl.toString(), 'POST', token, payload);
    console.log(`Created bucket: ${bucketName}`);
  }

  console.log('InfluxDB init completed.');
}

main().catch((error) => {
  console.error('Influx init failed:', error.message);
  process.exit(1);
});
