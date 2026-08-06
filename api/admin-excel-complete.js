import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, readJsonBody } from '../lib/http.js';
import {
  downloadPathname,
  isValidVendorId,
  vendorIdFromDownloadPath,
} from '../lib/download-paths.js';
import { registerVendorDownload } from '../lib/register-download.js';

/**
 * Registers blob metadata after a client upload finishes.
 * Backup for onUploadCompleted (works locally without public webhook).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  const vendorId = String(body.value.vendor_id || '').trim();
  const pathname = String(body.value.pathname || '').trim();
  const blobUrl = String(body.value.url || body.value.blob_url || '').trim();
  const filename = body.value.filename ? String(body.value.filename) : null;
  const byteSize =
    body.value.size != null || body.value.byte_size != null
      ? Number(body.value.size ?? body.value.byte_size)
      : null;

  if (!isValidVendorId(vendorId)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid vendor_id.' });
  }
  if (pathname !== downloadPathname(vendorId)) {
    return sendJson(res, 400, { ok: false, error: 'pathname does not match vendor_id.' });
  }
  if (vendorIdFromDownloadPath(pathname) !== vendorId) {
    return sendJson(res, 400, { ok: false, error: 'pathname vendor mismatch.' });
  }
  if (!blobUrl) {
    return sendJson(res, 400, { ok: false, error: 'blob url is required.' });
  }

  try {
    const row = await registerVendorDownload({
      vendorId,
      blobUrl,
      pathname,
      filename,
      byteSize: Number.isFinite(byteSize) ? byteSize : null,
    });
    return sendJson(res, 200, { ok: true, download: row });
  } catch (err) {
    console.error('admin-excel-complete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not register download.' });
  }
}
