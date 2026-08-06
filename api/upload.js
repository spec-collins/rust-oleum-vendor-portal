import { handleUpload } from '@vercel/blob/client';
import { sendJson, readJsonBody, getQuery } from '../lib/http.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';
import {
  parseUploadPathname,
  isAllowedUploadFilename,
  isAllowedUploadMime,
} from '../lib/upload-paths.js';
import {
  countVendorUploads,
  registerVendorUpload,
  listVendorUploads,
} from '../lib/register-upload.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
  ALLOWED_UPLOAD_MIME,
  ALLOWED_UPLOAD_EXTENSIONS,
} from '../lib/limits.js';

/**
 * Vendor uploads (Hobby-friendly single function):
 * - GET  ?vid=&t=           → list this vendor's files
 * - POST handleUpload body  → Blob client token / completion webhook
 * - POST {pathname,url,...} → register metadata after client upload
 */
export default async function handler(req, res) {
  if (req.method === 'GET') return listHandler(req, res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  const type = body.value?.type;
  if (type === 'blob.generate-client-token' || type === 'blob.upload-completed') {
    return tokenHandler(req, res, body.value);
  }
  return completeHandler(req, res, body.value);
}

async function listHandler(req, res) {
  const q = getQuery(req);
  const auth = assertVendorAccess({ vendorId: q.get('vid'), token: q.get('t') });
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
    console.error('upload list failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not list uploads.' });
  }
}

async function tokenHandler(req, res, body) {
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

async function completeHandler(req, res, value) {
  const q = getQuery(req);
  const vendorId = String(value.vendor_id || q.get('vid') || '').trim();
  const token = String(
    value.token || q.get('t') || req.headers['x-vendor-token'] || ''
  ).trim();

  const auth = assertVendorAccess({ vendorId, token });
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const pathname = String(value.pathname || '').trim();
  const blobUrl = String(value.url || value.blob_url || '').trim();
  const originalName = String(value.filename || value.original_name || '').trim();
  const contentType = value.content_type ? String(value.content_type) : null;
  const byteSize =
    value.size != null || value.byte_size != null
      ? Number(value.size ?? value.byte_size)
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
      upload: {
        id: Number(row.id),
        vendor_id: row.vendor_id,
        pathname: row.pathname,
        blob_url: row.blob_url,
        original_name: row.original_name,
        content_type: row.content_type,
        byte_size: row.byte_size != null ? Number(row.byte_size) : null,
        uploaded_at: row.uploaded_at,
      },
      count: newCount,
      previous_count: count,
    });
  } catch (err) {
    console.error('upload complete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not register upload.' });
  }
}
