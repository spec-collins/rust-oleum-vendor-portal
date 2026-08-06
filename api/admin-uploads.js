import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { isValidVendorId } from '../lib/download-paths.js';
import { listVendorUploads, countVendorUploads } from '../lib/register-upload.js';
import { parseUploadPathname } from '../lib/upload-paths.js';
import { presignPrivateGet } from '../lib/presign-get.js';

/**
 * Admin uploads:
 * - GET                       → vendors + upload counts
 * - GET ?vendor_id=           → files for one vendor (SMS-friendly metadata)
 * - GET ?id= or ?pathname=    → redirect to short-lived private file download
 */
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
  if (id || pathnameQ) return downloadOne(res, id, pathnameQ);

  const vendorId = String(q.get('vendor_id') || '').trim();

  try {
    if (vendorId) {
      if (!isValidVendorId(vendorId)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid vendor_id.' });
      }
      const [files, count] = await Promise.all([
        listVendorUploads(vendorId),
        countVendorUploads(vendorId),
      ]);
      return sendJson(res, 200, {
        ok: true,
        vendor_id: vendorId,
        count,
        files: files.map(serializeFile),
      });
    }

    const { rows } = await query(
      `SELECT m.vendor_id,
              m.vendor_name,
              m.rank,
              coalesce(u.n, 0)::int AS upload_count,
              u.last_uploaded_at
         FROM vendor_metrics m
         LEFT JOIN (
           SELECT vendor_id,
                  count(*)::int AS n,
                  max(uploaded_at) AS last_uploaded_at
             FROM vendor_uploads
            GROUP BY vendor_id
         ) u ON u.vendor_id = m.vendor_id
         ORDER BY coalesce(u.n, 0) DESC, m.rank NULLS LAST, m.vendor_name`
    );

    return sendJson(res, 200, {
      ok: true,
      vendors: rows.map((r) => ({
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        rank: r.rank,
        upload_count: Number(r.upload_count) || 0,
        last_uploaded_at: r.last_uploaded_at || null,
      })),
    });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-uploads failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not list uploads.' });
  }
}

async function downloadOne(res, id, pathnameQ) {
  try {
    let row;
    if (id) {
      const result = await query(
        `SELECT id, vendor_id, pathname, original_name
           FROM vendor_uploads WHERE id = $1`,
        [Number(id)]
      );
      row = result.rows[0];
    } else {
      const result = await query(
        `SELECT id, vendor_id, pathname, original_name
           FROM vendor_uploads WHERE pathname = $1`,
        [String(pathnameQ)]
      );
      row = result.rows[0];
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
    console.error('admin-uploads download failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not prepare download.' });
  }
}

function serializeFile(r) {
  return {
    id: Number(r.id),
    vendor_id: r.vendor_id,
    pathname: r.pathname,
    blob_url: r.blob_url,
    original_name: r.original_name,
    content_type: r.content_type,
    byte_size: r.byte_size != null ? Number(r.byte_size) : null,
    uploaded_at: r.uploaded_at,
  };
}
