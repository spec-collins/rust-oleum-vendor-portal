import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { parseUploadPathname } from '../lib/upload-paths.js';
import { presignPrivateGet } from '../lib/presign-get.js';

/** Admin: redirect to a short-lived private GET for one registered upload. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const q = getQuery(req);
  const id = q.get('id');
  const pathnameQ = q.get('pathname');

  try {
    let row;
    if (id) {
      const result = await query(
        `SELECT id, vendor_id, pathname, original_name
           FROM vendor_uploads WHERE id = $1`,
        [Number(id)]
      );
      row = result.rows[0];
    } else if (pathnameQ) {
      const result = await query(
        `SELECT id, vendor_id, pathname, original_name
           FROM vendor_uploads WHERE pathname = $1`,
        [String(pathnameQ)]
      );
      row = result.rows[0];
    } else {
      return sendJson(res, 400, { ok: false, error: 'id or pathname is required.' });
    }

    if (!row) {
      return sendJson(res, 404, { ok: false, error: 'Upload not found.' });
    }

    const parsed = parseUploadPathname(row.pathname);
    if (!parsed || parsed.vendor_id !== row.vendor_id) {
      return sendJson(res, 500, { ok: false, error: 'Stored pathname is invalid.' });
    }

    const location = await presignPrivateGet(row.pathname);
    res.statusCode = 302;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-upload-file failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not prepare download.' });
  }
}
