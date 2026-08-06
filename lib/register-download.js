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
