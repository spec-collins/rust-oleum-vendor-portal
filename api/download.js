import { Readable } from 'node:stream';
import { get } from '@vercel/blob';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import {
  vendorIdFromDownloadPath,
  vendorTemplateFilename,
  contentDispositionAttachment,
} from '../lib/download-paths.js';
import { assertVendorAccess } from '../lib/vendor-auth.js';

/**
 * Signed vendor download: verify link token, then stream the private Blob
 * with Content-Disposition "{Vendor Name} template.xlsx".
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
    const { rows } = await query(
      `SELECT d.pathname, d.filename, d.blob_url,
              m.vendor_name AS metrics_name
         FROM vendor_download_files d
         LEFT JOIN vendor_metrics m ON m.vendor_id = d.vendor_id
        WHERE d.vendor_id = $1`,
      [auth.vendorId]
    );
    const row = rows[0];
    if (!row) {
      return sendJson(res, 404, { ok: false, error: 'No Excel template on file for this vendor.' });
    }

    if (vendorIdFromDownloadPath(row.pathname) !== auth.vendorId) {
      console.error('Download pathname mismatch', auth.vendorId, row.pathname);
      return sendJson(res, 500, { ok: false, error: 'Stored file path is invalid.' });
    }

    const linkName = String(q.get('name') || '').trim();
    const displayName = vendorTemplateFilename(
      row.metrics_name || linkName || null,
      auth.vendorId
    );

    const result = await get(row.pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return sendJson(res, 502, { ok: false, error: 'Could not fetch template from storage.' });
    }

    res.statusCode = 200;
    res.setHeader(
      'Content-Type',
      result.blob?.contentType ||
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', contentDispositionAttachment(displayName));
    res.setHeader('Cache-Control', 'no-store');
    if (result.blob?.size) {
      res.setHeader('Content-Length', String(result.blob.size));
    }

    const nodeStream =
      typeof Readable.fromWeb === 'function'
        ? Readable.fromWeb(result.stream)
        : null;
    if (nodeStream) {
      nodeStream.on('error', (err) => {
        console.error('download stream error:', err);
        if (!res.headersSent) {
          sendJson(res, 500, { ok: false, error: 'Download stream failed.' });
        } else {
          res.destroy(err);
        }
      });
      nodeStream.pipe(res);
      return;
    }

    const reader = result.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('download failed:', err);
    if (!res.headersSent) {
      return sendJson(res, 500, { ok: false, error: 'Could not prepare download.' });
    }
    res.end();
  }
}
