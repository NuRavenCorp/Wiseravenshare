const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { ALLOWED_TABLES, TABLE_SCHEMAS } = require('./schemaMap');

const app = express();
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
  connectionString: process.env.DO_PG_CONNECTION_STRING,
  ssl: { rejectUnauthorized: true },
});

const API_KEY = process.env.SYNC_API_KEY;
if (!API_KEY) {
  console.error('FATAL: SYNC_API_KEY environment variable is required');
  process.exit(1);
}

function isValidIdentifier(name) {
  return typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

// DigitalOcean Spaces storage config
const SPACES_ACCESS_KEY = process.env.DO_SPACES_ACCESS_KEY_ID;
const SPACES_SECRET_KEY = process.env.DO_SPACES_SECRET_ACCESS_KEY;
const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || 'https://bucket-wrs-01010.nyc3.digitaloceanspaces.com';
const SPACES_REGION = process.env.DO_SPACES_REGION || 'nyc3';

function presignS3({ method, accessKey, secretKey, host, region, key, expiresIn = 3600 }) {
  const service = 's3';
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:-]/g, '').split('.')[0] + 'Z';
  const date = timestamp.substring(0, 8);
  const objectPath = '/' + key.split('/').map(encodeURIComponent).join('/');
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${date}/${region}/${service}/aws4_request`,
    'X-Amz-Date': timestamp,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(queryParams).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`).join('&');
  const canonicalRequest = `${method}\n${objectPath}\n${canonicalQuery}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const kDate = crypto.createHmac('sha256', 'AWS4' + secretKey).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const signingKey = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `https://${host}${objectPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/storage/health') return next();
  if (req.headers.authorization !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

// POST /upsert — create table if needed, upsert records
app.post('/upsert', async (req, res) => {
  const { table, columns, records } = req.body;
  try {
    if (!ALLOWED_TABLES.has(table) || !isValidIdentifier(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    const schemaColumns = TABLE_SCHEMAS[table]?.columns || [];
    const resolvedColumns = Array.isArray(columns) && columns.length > 0 ? columns : schemaColumns;
    if (!resolvedColumns.length) {
      return res.status(400).json({ error: 'Column definitions are required for this table' });
    }

    for (const c of resolvedColumns) {
      if (!isValidIdentifier(c.name)) {
        return res.status(400).json({ error: 'Invalid column name' });
      }
    }

    // Create table if not exists
    const colDefs = resolvedColumns.map(c => `"${c.name}" ${c.type}`).join(', ');
    await pool.query(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs})`);

    const colNames = resolvedColumns.map(c => c.name);
    const updateCols = colNames.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    const placeholders = colNames.map((_, i) => `$${i + 1}`).join(', ');
    const colList = colNames.map(c => `"${c}"`).join(', ');
    const sql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${updateCols}`;

    for (const record of records) {
      const values = colNames.map(f => {
        const v = record[f];
        if (v === undefined || v === null) return null;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      await pool.query(sql, values);
    }

    res.json({ upserted: records.length });
  } catch (e) {
    console.error(`Upsert error for ${table}:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /query — run a read-only SELECT and return rows
app.post('/query', async (req, res) => {
  const { sql, params } = req.body;
  if (!sql || !sql.trim().toUpperCase().startsWith('SELECT')) {
    return res.status(400).json({ error: 'Only SELECT queries allowed' });
  }
  // Reject multi-statement queries (semicolons outside of string literals)
  const trimmed = sql.trim();
  if (trimmed.endsWith(';') && trimmed.length > 1) {
    return res.status(400).json({ error: 'Only single SELECT queries allowed' });
  }
  if (trimmed.includes(';')) {
    return res.status(400).json({ error: 'Only single SELECT queries allowed' });
  }
  try {
    const result = await pool.query(sql, params || []);
    res.json({ rows: result.rows });
  } catch (e) {
    if (e.code === '42P01') {
      res.json({ rows: [], note: 'table does not exist yet' });
    } else {
      console.error('Query error:', e.message);
      res.status(500).json({ error: e.message });
    }
  }
});

// GET /fetch/:table — return all rows
app.get('/fetch/:table', async (req, res) => {
  try {
    const table = req.params.table;
    if (!ALLOWED_TABLES.has(table) || !isValidIdentifier(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    const result = await pool.query(`SELECT * FROM "${table}"`);
    res.json({ rows: result.rows });
  } catch (e) {
    if (e.code === '42P01') {
      res.json({ rows: [], note: 'table does not exist yet' });
    } else {
      console.error(`Fetch error for ${req.params.table}:`, e.message);
      res.status(500).json({ error: e.message });
    }
  }
});

// Storage health check
app.get('/storage/health', (req, res) => {
  res.json({
    configured: !!(SPACES_ACCESS_KEY && SPACES_SECRET_KEY),
    endpoint: SPACES_ENDPOINT,
    region: SPACES_REGION,
  });
});

// Presign an upload URL for direct-to-Spaces upload
app.post('/storage/presign', (req, res) => {
  const { filename, folder = 'uploads' } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename is required' });
  if (!SPACES_ACCESS_KEY || !SPACES_SECRET_KEY) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  const host = new URL(SPACES_ENDPOINT).host;
  const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `${folder}/${Date.now()}-${safeName}`;
  const uploadUrl = presignS3({
    method: 'PUT',
    accessKey: SPACES_ACCESS_KEY,
    secretKey: SPACES_SECRET_KEY,
    host,
    region: SPACES_REGION,
    key,
  });
  const fileUrl = `https://${host}/${key}`;
  res.json({ uploadUrl, fileUrl, key });
});

// Presign a download URL for private file access
app.post('/storage/presign-get', (req, res) => {
  const { key } = req.body;
  if (!key) return res.status(400).json({ error: 'key is required' });
  if (!SPACES_ACCESS_KEY || !SPACES_SECRET_KEY) {
    return res.status(500).json({ error: 'Storage not configured' });
  }
  const host = new URL(SPACES_ENDPOINT).host;
  const downloadUrl = presignS3({
    method: 'GET',
    accessKey: SPACES_ACCESS_KEY,
    secretKey: SPACES_SECRET_KEY,
    host,
    region: SPACES_REGION,
    key,
  });
  res.json({ downloadUrl });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PG proxy listening on ${port}`));