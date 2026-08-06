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
 * Client-upload token + completion webhook for per-vendor Excel templates.
 * Admin auth required on token generation.
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

  // Token generation is admin-gated. Completion callbacks come from Vercel Blob (no admin header).
  if (body.value?.type !== 'blob.upload-completed') {
    const auth = assertAdmin(req);
    if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
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
    console.error('admin-excel-upload failed:', err);
    return sendJson(res, 400, { ok: false, error: err.message || 'Upload failed.' });
  }
}
