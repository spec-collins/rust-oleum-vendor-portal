import { sendJson, readJsonBody, getQuery } from '../lib/http.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import { parseUploadPathname } from '../lib/upload-paths.js';
import { registerVendorUpload, countVendorUploads } from '../lib/register-upload.js';
import { MAX_UPLOAD_FILES_PER_VENDOR } from '../lib/limits.js';

/** Registers metadata after a vendor client upload (works without public webhook). */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  const q = getQuery(req);
  const vendorId = String(body.value.vendor_id || q.get('vid') || '').trim();
  const token = String(
    body.value.token || q.get('t') || req.headers['x-vendor-token'] || ''
  ).trim();

  const auth = assertVendorAccess({ vendorId, token });
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const pathname = String(body.value.pathname || '').trim();
  const blobUrl = String(body.value.url || body.value.blob_url || '').trim();
  const originalName = String(body.value.filename || body.value.original_name || '').trim();
  const contentType = body.value.content_type ? String(body.value.content_type) : null;
  const byteSize =
    body.value.size != null || body.value.byte_size != null
      ? Number(body.value.size ?? body.value.byte_size)
      : null;

  const parsed = parseUploadPathname(pathname);
  if (!parsed || parsed.vendor_id !== vendorId) {
    return sendJson(res, 400, { ok: false, error: 'Invalid upload pathname for vendor.' });
  }
  if (!blobUrl) {
    return sendJson(res, 400, { ok: false, error: 'blob url is required.' });
  }
  if (!originalName) {
    return sendJson(res, 400, { ok: false, error: 'filename is required.' });
  }

  try {
    const count = await countVendorUploads(vendorId);
    if (count >= MAX_UPLOAD_FILES_PER_VENDOR) {
      return sendJson(res, 409, {
        ok: false,
        error: `Vendor upload limit of ${MAX_UPLOAD_FILES_PER_VENDOR} files reached.`,
      });
    }

    const row = await registerVendorUpload({
      vendorId,
      pathname,
      blobUrl,
      originalName,
      contentType,
      byteSize: Number.isFinite(byteSize) ? byteSize : null,
    });

    const newCount = await countVendorUploads(vendorId);
    return sendJson(res, 200, {
      ok: true,
      upload: serialize(row),
      count: newCount,
      previous_count: count,
    });
  } catch (err) {
    console.error('upload-complete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not register upload.' });
  }
}

function serialize(row) {
  return {
    id: Number(row.id),
    vendor_id: row.vendor_id,
    pathname: row.pathname,
    blob_url: row.blob_url,
    original_name: row.original_name,
    content_type: row.content_type,
    byte_size: row.byte_size != null ? Number(row.byte_size) : null,
    uploaded_at: row.uploaded_at,
  };
}
