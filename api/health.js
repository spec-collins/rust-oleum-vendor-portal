import { query, UNDEFINED_TABLE, resolveConnectionString } from '../lib/db.js';
import { sendJson } from '../lib/http.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
} from '../lib/limits.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const url = resolveConnectionString();
  const config = {
    project: process.env.PORTAL_PROJECT || 'rust-oleum-vendor-portal',
    database_url_set: Boolean(url),
    database_pooled: url ? url.includes('-pooler') : null,
    admin_token_set: Boolean(process.env.ADMIN_TOKEN),
    sms_pull_token_set: Boolean(process.env.SMS_PULL_TOKEN || process.env.ADMIN_TOKEN),
    link_signing_enabled: Boolean(process.env.LINK_SIGNING_SECRET),
    base_url_set: Boolean(process.env.BASE_URL),
    max_upload_files: MAX_UPLOAD_FILES_PER_VENDOR,
    max_upload_bytes_per_file: MAX_UPLOAD_BYTES_PER_FILE,
  };

  if (!config.database_url_set) {
    return sendJson(res, 503, { ok: false, error: 'DATABASE_URL is not set.', config });
  }

  try {
    const { rows } = await query('SELECT count(*)::int AS vendors FROM vendor_responses');
    return sendJson(res, 200, { ok: true, migrated: true, vendors: rows[0].vendors, config });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, {
        ok: false,
        migrated: false,
        error: 'Tables are missing. Run: npm run migrate',
        config,
      });
    }
    console.error('Health check failed:', err);
    return sendJson(res, 503, { ok: false, error: 'Database is unreachable.', config });
  }
}
