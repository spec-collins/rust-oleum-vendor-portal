import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';

/** Lists vendors (from metrics ingest) and whether a download Excel is on file. */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

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
