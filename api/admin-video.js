import { handleUpload } from '@vercel/blob/client';
import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, readJsonBody } from '../lib/http.js';
import { UNDEFINED_TABLE } from '../lib/db.js';
import {
  EXPLAINER_PATHNAME,
  EXPLAINER_MAX_BYTES,
  EXPLAINER_CONTENT_TYPES,
  isExplainerPathname,
  safeVideoFilename,
  getExplainerVideo,
  registerExplainerVideo,
  deleteExplainerVideo,
} from '../lib/explainer-video.js';

/**
 * Admin explainer video:
 * - GET                 → status
 * - POST (blob token)   → upload / overwrite
 * - POST (complete)     → register after client upload
 * - DELETE              → remove Blob + registry
 */
export default async function handler(req, res) {
  if (req.method === 'GET') return status(req, res);
  if (req.method === 'DELETE') return remove(req, res);
  if (req.method === 'POST') return post(req, res);

  res.setHeader('Allow', 'GET, POST, DELETE');
  return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
}

function serialize(row) {
  if (!row) {
    return { ready: false, video: null };
  }
  return {
    ready: true,
    video: {
      pathname: row.pathname,
      filename: row.filename,
      content_type: row.content_type,
      byte_size: row.byte_size != null ? Number(row.byte_size) : null,
      uploaded_at: row.uploaded_at || null,
    },
  };
}

async function status(req, res) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const row = await getExplainerVideo();
    return sendJson(res, 200, { ok: true, ...serialize(row) });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-video status failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not load video status.' });
  }
}

async function remove(req, res) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const result = await deleteExplainerVideo();
    return sendJson(res, 200, {
      ok: true,
      deleted: result.deleted,
      pathname: result.pathname || null,
    });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-video delete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not delete explainer video.' });
  }
}

async function post(req, res) {
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

        if (!isExplainerPathname(pathname)) {
          throw new Error(`pathname must be ${EXPLAINER_PATHNAME}`);
        }

        return {
          allowedContentTypes: EXPLAINER_CONTENT_TYPES,
          maximumSizeInBytes: EXPLAINER_MAX_BYTES,
          allowOverwrite: true,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            filename: safeVideoFilename(payload.filename),
            content_type: 'video/mp4',
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
        await registerExplainerVideo({
          pathname: blob.pathname,
          filename: meta.filename || blob.pathname.split('/').pop(),
          contentType: meta.content_type || blob.contentType || 'video/mp4',
          blobUrl: blob.url,
          byteSize: blob.size ?? null,
        });
      },
    });

    return sendJson(res, 200, jsonResponse);
  } catch (err) {
    console.error('admin-video upload failed:', err);
    return sendJson(res, 400, { ok: false, error: err.message || 'Upload failed.' });
  }
}

async function handleComplete(req, res, value) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const pathname = String(value.pathname || '').trim();
  const blobUrl = String(value.url || value.blob_url || '').trim();
  const filename = value.filename ? String(value.filename) : null;
  const byteSize =
    value.size != null || value.byte_size != null
      ? Number(value.size ?? value.byte_size)
      : null;

  if (!isExplainerPathname(pathname)) {
    return sendJson(res, 400, { ok: false, error: `pathname must be ${EXPLAINER_PATHNAME}` });
  }
  if (!blobUrl) {
    return sendJson(res, 400, { ok: false, error: 'blob url is required.' });
  }

  try {
    const row = await registerExplainerVideo({
      pathname,
      filename,
      contentType: 'video/mp4',
      blobUrl,
      byteSize: Number.isFinite(byteSize) ? byteSize : null,
    });
    return sendJson(res, 200, { ok: true, ...serialize(row) });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-video complete failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not register explainer video.' });
  }
}
