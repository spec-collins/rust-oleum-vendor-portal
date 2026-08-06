import { handleUpload } from '@vercel/blob/client';
import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, readJsonBody } from '../lib/http.js';
import {
  downloadPathname,
  isValidVendorId,
  vendorIdFromDownloadPath,
  safeExcelFilename,
} from '../lib/download-paths.js';
import { registerVendorDownload } from '../lib/register-download.js';

const XLSX_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

/**
 * Admin Excel template upload (token + complete) in one function.
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

  const type = body.value?.type;
  if (type === 'blob.generate-client-token' || type === 'blob.upload-completed') {
    return handleTokenFlow(req, res, body.value);
  }
  return handleComplete(req, res, body.value);
}

async function handleTokenFlow(req, res, body) {
  if (body?.type !== 'blob.upload-completed') {
    const auth = assertAdmin(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload = {};
        try {
          payload = clientPayload ? JSON.parse(clientPayload) : {};
        } catch {
          throw new Error('Invalid clientPayload JSON.');
        }

        const vendorId = String(payload.vendor_id || '').trim();
        if (!isValidVendorId(vendorId)) {
          throw new Error('vendor_id is required and must be a slug.');
        }

        const expected = downloadPathname(vendorId);
        if (pathname !== expected) {
          throw new Error(`pathname must be ${expected}`);
        }

        return {
          allowedContentTypes: XLSX_TYPES,
          maximumSizeInBytes: 40 * 1024 * 1024,
          allowOverwrite: true,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            vendor_id: vendorId,
            filename: safeExcelFilename(payload.filename, vendorId),
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
        const vendorId =
          meta.vendor_id || vendorIdFromDownloadPath(blob.pathname);
        if (!vendorId) {
          console.error('Upload completed without vendor_id', blob.pathname);
          return;
        }
        await registerVendorDownload({
          vendorId,
          blobUrl: blob.url,
          pathname: blob.pathname,
          filename: meta.filename || blob.pathname.split('/').pop(),
          byteSize: blob.size ?? null,
        });
      },
    });

    return sendJson(res, 200, jsonResponse);
  } catch (err) {
    console.error('admin-excel upload failed:', err);
    return sendJson(res, 400, { ok: false, error: err.message || 'Upload failed.' });
  }
}

async function handleComplete(req, res, value) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const vendorId = String(value.vendor_id || '').trim();
  const pathname = String(value.pathname || '').trim();
  const blobUrl = String(value.url || value.blob_url || '').trim();
  const filename = value.filename ? String(value.filename) : null;
  const byteSize =
    value.size != null || value.byte_size != null
      ? Number(value.size ?? value.byte_size)
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
    console.error('admin-excel complete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not register download.' });
  }
}
