import { sendJson, getQuery } from '../lib/http.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import { listVendorUploads, countVendorUploads } from '../lib/register-upload.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
  ALLOWED_UPLOAD_EXTENSIONS,
} from '../lib/limits.js';

/** Vendor-facing list of their uploaded files (signed link required). */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const q = getQuery(req);
  const auth = assertVendorAccess({
    vendorId: q.get('vid'),
    token: q.get('t'),
  });
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const [files, count] = await Promise.all([
      listVendorUploads(auth.vendorId),
      countVendorUploads(auth.vendorId),
    ]);

    return sendJson(res, 200, {
      ok: true,
      vendor_id: auth.vendorId,
      count,
      max_files: MAX_UPLOAD_FILES_PER_VENDOR,
      max_bytes_per_file: MAX_UPLOAD_BYTES_PER_FILE,
      allowed_extensions: ALLOWED_UPLOAD_EXTENSIONS,
      files: files.map((r) => ({
        id: Number(r.id),
        pathname: r.pathname,
        original_name: r.original_name,
        content_type: r.content_type,
        byte_size: r.byte_size != null ? Number(r.byte_size) : null,
        uploaded_at: r.uploaded_at,
      })),
    });
  } catch (err) {
    console.error('uploads list failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not list uploads.' });
  }
}
