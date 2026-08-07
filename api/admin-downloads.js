import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { isValidVendorId } from '../lib/download-paths.js';
import {
  deleteVendorDownload,
  deleteAllVendorDownloads,
} from '../lib/register-download.js';

/**
 * GET  → list vendors + whether Excel is on file
 * DELETE ?vendor_id= → remove one vendor Excel (Blob + DB)
 * DELETE ?all=1      → remove every vendor Excel (Blob + DB)
 */
export default async function handler(req, res) {
  if (req.method === 'GET') return listDownloads(req, res);
  if (req.method === 'DELETE') return deleteDownloads(req, res);

  res.setHeader('Allow', 'GET, DELETE');
  return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
}

async function listDownloads(req, res) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const { rows } = await query(
      `SELECT m.vendor_id,
              m.vendor_name,
              m.rank,
              d.filename,
              d.pathname,
              d.byte_size,
              d.uploaded_at,
              (d.vendor_id IS NOT NULL) AS has_download
         FROM vendor_metrics m
         LEFT JOIN vendor_download_files d ON d.vendor_id = m.vendor_id
         ORDER BY m.rank NULLS LAST, m.vendor_name`
    );

    return sendJson(res, 200, {
      ok: true,
      vendors: rows.map((r) => ({
        vendor_id: r.vendor_id,
        vendor_name: r.vendor_name,
        rank: r.rank,
        has_download: Boolean(r.has_download),
        filename: r.filename || null,
        pathname: r.pathname || null,
        byte_size: r.byte_size != null ? Number(r.byte_size) : null,
        uploaded_at: r.uploaded_at || null,
      })),
    });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-downloads failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not list downloads.' });
  }
}

async function deleteDownloads(req, res) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const q = getQuery(req);
  const all = String(q.get('all') || '').trim() === '1';
  const vendorId = String(q.get('vendor_id') || '').trim();

  if (!all && !vendorId) {
    return sendJson(res, 400, {
      ok: false,
      error: 'Pass vendor_id=… or all=1.',
    });
  }
  if (!all && !isValidVendorId(vendorId)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid vendor_id.' });
  }

  try {
    const result = all
      ? await deleteAllVendorDownloads()
      : await deleteVendorDownload(vendorId);

    return sendJson(res, 200, {
      ok: true,
      deleted: result.deleted,
      vendor_ids: result.vendor_ids,
      scope: all ? 'all' : 'one',
    });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-downloads delete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not delete Excel template(s).' });
  }
}
