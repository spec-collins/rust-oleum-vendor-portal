import { del } from '@vercel/blob';
import { query } from './db.js';

export const EXPLAINER_ASSET_KEY = 'explainer_video';
export const EXPLAINER_PATHNAME = 'assets/explainer.mp4';
export const EXPLAINER_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
export const EXPLAINER_CONTENT_TYPES = ['video/mp4', 'application/octet-stream'];

export function isExplainerPathname(pathname) {
  return String(pathname || '') === EXPLAINER_PATHNAME;
}

export function safeVideoFilename(name) {
  const base = String(name || 'explainer.mp4')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 180);
  if (/\.mp4$/i.test(base)) return base;
  return 'explainer.mp4';
}

export async function getExplainerVideo() {
  const { rows } = await query(
    `SELECT asset_key, pathname, filename, content_type, blob_url, byte_size, uploaded_at
       FROM portal_media
      WHERE asset_key = $1`,
    [EXPLAINER_ASSET_KEY]
  );
  return rows[0] || null;
}

export async function registerExplainerVideo({
  pathname,
  filename,
  contentType,
  blobUrl,
  byteSize,
}) {
  const path = pathname || EXPLAINER_PATHNAME;
  const displayName = safeVideoFilename(filename);

  await query(
    `INSERT INTO portal_media (asset_key, pathname, filename, content_type, blob_url, byte_size, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (asset_key) DO UPDATE SET
       pathname = EXCLUDED.pathname,
       filename = EXCLUDED.filename,
       content_type = EXCLUDED.content_type,
       blob_url = EXCLUDED.blob_url,
       byte_size = EXCLUDED.byte_size,
       uploaded_at = now()`,
    [
      EXPLAINER_ASSET_KEY,
      path,
      displayName,
      contentType || 'video/mp4',
      blobUrl || null,
      byteSize ?? null,
    ]
  );

  return getExplainerVideo();
}

export async function deleteExplainerVideo() {
  const row = await getExplainerVideo();
  if (!row) return { deleted: 0 };

  try {
    await del(row.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    console.warn('Explainer blob delete warning:', err?.message || err);
  }

  await query(`DELETE FROM portal_media WHERE asset_key = $1`, [EXPLAINER_ASSET_KEY]);
  return { deleted: 1, pathname: row.pathname };
}
