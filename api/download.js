import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { vendorIdFromDownloadPath } from '../lib/download-paths.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import { presignPrivateGet } from '../lib/presign-get.js';

/**
 * Signed vendor download: verify link token, then redirect to a short-lived
 * private Blob GET URL for that vendor's template only.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const q = getQuery(req);
  const auth = assertVendorAccess({ vendorId: q.get('vid'), token: q.get('t') });
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 503, { ok: false, error: 'Blob storage is not configured.' });
  }

  try {
    const { rows } = await query(
      `SELECT pathname, filename, blob_url
         FROM vendor_download_files
        WHERE vendor_id = $1`,
      [auth.vendorId]
    );
    const row = rows[0];
    if (!row) {
      return sendJson(res, 404, { ok: false, error: 'No Excel template on file for this vendor.' });
    }

    if (vendorIdFromDownloadPath(row.pathname) !== auth.vendorId) {
      console.error('Download pathname mismatch', auth.vendorId, row.pathname);
      return sendJson(res, 500, { ok: false, error: 'Stored file path is invalid.' });
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
    console.error('download failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not prepare download.' });
  }
}
