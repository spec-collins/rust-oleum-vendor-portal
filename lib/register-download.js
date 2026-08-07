import { del } from '@vercel/blob';
import { query } from './db.js';
import { downloadPathname, safeExcelFilename } from './download-paths.js';

export async function registerVendorDownload({
  vendorId,
  blobUrl,
  pathname,
  filename,
  byteSize,
}) {
  const path = pathname || downloadPathname(vendorId);
  const displayName = safeExcelFilename(filename, vendorId);

  await query(
    `INSERT INTO vendor_download_files (vendor_id, pathname, filename, blob_url, byte_size, uploaded_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (vendor_id) DO UPDATE SET
       pathname = EXCLUDED.pathname,
       filename = EXCLUDED.filename,
       blob_url = EXCLUDED.blob_url,
       byte_size = EXCLUDED.byte_size,
       uploaded_at = now()`,
    [vendorId, path, displayName, blobUrl || null, byteSize ?? null]
  );

  return {
    vendor_id: vendorId,
    pathname: path,
    filename: displayName,
    blob_url: blobUrl || null,
    byte_size: byteSize ?? null,
  };
}

async function deleteBlobs(pathnames) {
  const unique = [...new Set(pathnames.filter(Boolean))];
  if (!unique.length) return 0;
  try {
    await del(unique, { token: process.env.BLOB_READ_WRITE_TOKEN });
  } catch (err) {
    // Blob may already be gone; still clear DB so admin can re-upload.
    console.warn('Blob delete warning:', err?.message || err);
  }
  return unique.length;
}

/** Remove one vendor’s Excel from Blob + registry. Returns deleted count (0 or 1). */
export async function deleteVendorDownload(vendorId) {
  const { rows } = await query(
    `SELECT vendor_id, pathname FROM vendor_download_files WHERE vendor_id = $1`,
    [vendorId]
  );
  if (!rows.length) return { deleted: 0, vendor_ids: [] };

  await deleteBlobs(rows.map((r) => r.pathname));
  await query(`DELETE FROM vendor_download_files WHERE vendor_id = $1`, [vendorId]);
  return { deleted: 1, vendor_ids: [vendorId] };
}

/** Remove every registered vendor Excel from Blob + registry. */
export async function deleteAllVendorDownloads() {
  const { rows } = await query(
    `SELECT vendor_id, pathname FROM vendor_download_files ORDER BY vendor_id`
  );
  if (!rows.length) return { deleted: 0, vendor_ids: [] };

  await deleteBlobs(rows.map((r) => r.pathname));
  await query(`DELETE FROM vendor_download_files`);
  return {
    deleted: rows.length,
    vendor_ids: rows.map((r) => r.vendor_id),
  };
}
