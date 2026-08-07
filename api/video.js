import { sendJson, getQuery } from '../lib/http.js';
import { UNDEFINED_TABLE } from '../lib/db.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import { presignPrivateGet } from '../lib/presign-get.js';
import { getExplainerVideo, isExplainerPathname } from '../lib/explainer-video.js';

/**
 * Vendor explainer video: verify signed link, redirect to short-lived private Blob GET.
 * Use as <video src="/api/video?vid=&t="> so the player follows to Blob (range-friendly).
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
    const row = await getExplainerVideo();
    if (!row || !isExplainerPathname(row.pathname)) {
      return sendJson(res, 404, { ok: false, error: 'No explainer video on file.' });
    }

    // Longer TTL so playback can continue without mid-stream expiry.
    const location = await presignPrivateGet(row.pathname, { ttlMs: 2 * 60 * 60 * 1000 });
    res.statusCode = 302;
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('video failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not prepare video.' });
  }
}
