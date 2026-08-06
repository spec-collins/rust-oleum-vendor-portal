/**
 * Uploads tiny private Excel templates for two vendors and registers them.
 * Used to prove download isolation without the admin UI.
 *
 *   node scripts/seed-test-excels.mjs
 */
import XLSX from 'xlsx';
import { put } from '@vercel/blob';
import { loadLocalEnvChain } from '../lib/env.js';
import { closePool } from '../lib/db.js';
import { downloadPathname } from '../lib/download-paths.js';
import { registerVendorDownload } from '../lib/register-download.js';

loadLocalEnvChain();

const VENDORS = [
  {
    id: 'packaging-corporation-of-america',
    name: 'Packaging Corporation of America',
    marker: 'PCA-ONLY-TEMPLATE',
  },
  {
    id: 'mpi-label-systems',
    name: 'MPI Label Systems',
    marker: 'MPI-ONLY-TEMPLATE',
  },
];

function buildXlsx(marker, vendorName) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Vendor', 'Marker', 'Note'],
    [vendorName, marker, 'Phase 3 isolation test file'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

try {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set (check .env.local).');
  }

  for (const vendor of VENDORS) {
    const buf = buildXlsx(vendor.marker, vendor.name);
    const pathname = downloadPathname(vendor.id);
    const blob = await put(pathname, buf, {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const row = await registerVendorDownload({
      vendorId: vendor.id,
      blobUrl: blob.url,
      pathname: blob.pathname,
      filename: `${vendor.id}-test-template.xlsx`,
      byteSize: buf.length,
    });
    console.log('OK', row.vendor_id, row.pathname, `bytes=${buf.length}`);
  }
} finally {
  await closePool();
}
