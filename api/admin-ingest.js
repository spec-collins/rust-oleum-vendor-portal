import { matchesSecret } from '../lib/signing.js';
import { sendJson, getQuery } from '../lib/http.js';
import { ingestDashboardWorkbook } from '../lib/ingest-dashboard.js';
import { UNDEFINED_TABLE } from '../lib/db.js';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error('Request body is too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Admin-only: POST raw .xlsx bytes (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 * or application/octet-stream) with ?token=ADMIN_TOKEN (or x-admin-token header).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return sendJson(res, 503, { ok: false, error: 'ADMIN_TOKEN is not configured.' });
  }

  const q = getQuery(req);
  const provided = q.get('token') || req.headers['x-admin-token'] || '';
  if (!matchesSecret(String(provided), expected)) {
    return sendJson(res, 401, { ok: false, error: 'Invalid admin token.' });
  }

  try {
    const body = await readRawBody(req, MAX_UPLOAD_BYTES);
    if (!body.length) {
      return sendJson(res, 400, { ok: false, error: 'Empty body. POST the .xlsx file bytes.' });
    }

    const result = await ingestDashboardWorkbook(body);
    return sendJson(res, 200, {
      ok: true,
      sheet: result.sheet,
      upserted: result.upserted,
      vendors: result.vendors,
    });
  } catch (err) {
    if (err && err.status === 413) {
      return sendJson(res, 413, { ok: false, error: err.message });
    }
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-ingest failed:', err);
    return sendJson(res, 400, { ok: false, error: err.message || 'Ingest failed.' });
  }
}
