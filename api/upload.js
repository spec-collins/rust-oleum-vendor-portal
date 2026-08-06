import { handleUpload } from '@vercel/blob/client';
import { sendJson, readJsonBody } from '../lib/http.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import {
  parseUploadPathname,
  isAllowedUploadFilename,
  isAllowedUploadMime,
} from '../lib/upload-paths.js';
import { countVendorUploads, registerVendorUpload } from '../lib/register-upload.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
  ALLOWED_UPLOAD_MIME,
} from '../lib/limits.js';

/**
 * Vendor client-upload token endpoint (direct-to-Blob).
 * Auth: signed vendor link (vid + t) in clientPayload / headers.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  try {
    const jsonResponse = await handleUpload({
      body: body.value,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error('Invalid clientPayload JSON.');
        }

        const vendorId = String(payload.vendor_id || '').trim();
        const token = String(payload.token || req.headers['x-vendor-token'] || '').trim();
        const auth = assertVendorAccess({ vendorId, token });
        if (!auth.ok) throw new Error(auth.error);

        const parsed = parseUploadPathname(pathname);
        if (!parsed || parsed.vendor_id !== vendorId) {
          throw new Error('pathname must be uploads/{vendor_id}/{uuid}-{name}.pdf|docx');
        }

        const filename = String(payload.filename || `${parsed.basename}${parsed.ext}`);
        if (!isAllowedUploadFilename(filename) && !isAllowedUploadFilename(pathname)) {
          throw new Error('Only PDF and DOCX files are allowed.');
        }

        const mime = payload.content_type ? String(payload.content_type) : '';
        if (mime && !isAllowedUploadMime(mime)) {
          throw new Error('Unsupported content type.');
        }

        const size = Number(payload.size);
        if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES_PER_FILE) {
          throw new Error(`File exceeds ${MAX_UPLOAD_BYTES_PER_FILE} byte limit.`);
        }

        const existing = await countVendorUploads(vendorId);
        if (existing >= MAX_UPLOAD_FILES_PER_VENDOR) {
          throw new Error(`Vendor upload limit of ${MAX_UPLOAD_FILES_PER_VENDOR} files reached.`);
        }

        return {
          allowedContentTypes: [...ALLOWED_UPLOAD_MIME, 'application/octet-stream'],
          maximumSizeInBytes: MAX_UPLOAD_BYTES_PER_FILE,
          allowOverwrite: false,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            vendor_id: vendorId,
            filename,
            content_type: mime || null,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let meta = {};
        try {
          meta = tokenPayload ? JSON.parse(tokenPayload) : {};
        } catch {
          meta = {};
        }
        const parsed = parseUploadPathname(blob.pathname);
        const vendorId = meta.vendor_id || parsed?.vendor_id;
        if (!vendorId) {
          console.error('upload completed without vendor_id', blob.pathname);
          return;
        }
        await registerVendorUpload({
          vendorId,
          pathname: blob.pathname,
          blobUrl: blob.url,
          originalName: meta.filename || blob.pathname.split('/').pop(),
          contentType: meta.content_type || blob.contentType || null,
          byteSize: blob.size ?? null,
        });
      },
    });

    return sendJson(res, 200, jsonResponse);
  } catch (err) {
    console.error('upload token failed:', err);
    return sendJson(res, 400, { ok: false, error: err.message || 'Upload failed.' });
  }
}
