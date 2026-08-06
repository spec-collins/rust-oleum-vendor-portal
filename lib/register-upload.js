import { query } from './db.js';

export async function registerVendorUpload({
  vendorId,
  pathname,
  blobUrl,
  originalName,
  contentType,
  byteSize,
}) {
  const { rows } = await query(
    `INSERT INTO vendor_uploads (
       vendor_id, pathname, blob_url, original_name, content_type, byte_size, uploaded_at
     ) VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (vendor_id, pathname) DO UPDATE SET
       blob_url = EXCLUDED.blob_url,
       original_name = EXCLUDED.original_name,
       content_type = EXCLUDED.content_type,
       byte_size = EXCLUDED.byte_size,
       uploaded_at = now()
     RETURNING id, vendor_id, pathname, blob_url, original_name, content_type, byte_size, uploaded_at`,
    [
      vendorId,
      pathname,
      blobUrl || null,
      originalName,
      contentType || null,
      byteSize ?? null,
    ]
  );
  return rows[0];
}

export async function countVendorUploads(vendorId) {
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM vendor_uploads WHERE vendor_id = $1`,
    [vendorId]
  );
  return rows[0]?.n || 0;
}

export async function listVendorUploads(vendorId) {
  const { rows } = await query(
    `SELECT id, vendor_id, pathname, blob_url, original_name, content_type, byte_size, uploaded_at
       FROM vendor_uploads
      WHERE vendor_id = $1
      ORDER BY uploaded_at DESC, id DESC`,
    [vendorId]
  );
  return rows;
}
