import { issueSignedToken, presignUrl, getDownloadUrl } from '@vercel/blob';
import { verifyVendorToken } from '../lib/signing.js';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { isValidVendorId, vendorIdFromDownloadPath } from '../lib/download-paths.js';

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

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
  const vendorId = clean(q.get('vid'), 128);
  const token = clean(q.get('t'), 128);

  if (!isValidVendorId(vendorId)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid vid.' });
  }

  const signingSecret = process.env.LINK_SIGNING_SECRET;
  if (signingSecret && !verifyVendorToken(vendorId, token, signingSecret)) {
    return sendJson(res, 403, { ok: false, error: 'Invalid or missing link token.' });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(res, 503, { ok: false, error: 'Blob storage is not configured.' });
  }

  try {
    const { rows } = await query(
      `SELECT pathname, filename, blob_url
         FROM vendor_download_files
        WHERE vendor_id = $1`,
      [vendorId]
    );
    const row = rows[0];
    if (!row) {
      return sendJson(res, 404, { ok: false, error: 'No Excel template on file for this vendor.' });
    }

    if (vendorIdFromDownloadPath(row.pathname) !== vendorId) {
      console.error('Download pathname mismatch', vendorId, row.pathname);
      return sendJson(res, 500, { ok: false, error: 'Stored file path is invalid.' });
    }

    const validUntil = Date.now() + 5 * 60 * 1000;
    const signed = await issueSignedToken({
      pathname: row.pathname,
      operations: ['get'],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signed, {
      access: 'private',
      operation: 'get',
      pathname: row.pathname,
      validUntil,
      useCache: false,
    });

    const location = getDownloadUrl(presignedUrl);
    res.statusCode = 302;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${String(row.filename || 'template.xlsx').replace(/"/g, '')}"`
    );
    return res.end();
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('download failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not prepare download.' });
  }
}
