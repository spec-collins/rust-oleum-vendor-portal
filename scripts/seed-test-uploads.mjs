/**
 * Seeds one private PDF per test vendor and registers them.
 *
 *   node scripts/seed-test-uploads.mjs
 */
import { put } from '@vercel/blob';
import { loadLocalEnvChain } from '../lib/env.js';
import { closePool } from '../lib/db.js';
import { buildUploadPathname } from '../lib/upload-paths.js';
import { registerVendorUpload } from '../lib/register-upload.js';

loadLocalEnvChain();

const PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000062 00000 n 
0000000121 00000 n 
trailer<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF
`,
  'utf8'
);

const VENDORS = [
  { id: 'packaging-corporation-of-america', name: 'PCA-SEED.pdf' },
  { id: 'mpi-label-systems', name: 'MPI-SEED.pdf' },
];

try {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('BLOB_READ_WRITE_TOKEN is not set.');
  }
  for (const v of VENDORS) {
    const pathname = buildUploadPathname(v.id, v.name);
    const blob = await put(pathname, PDF, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/pdf',
    });
    const row = await registerVendorUpload({
      vendorId: v.id,
      pathname: blob.pathname,
      blobUrl: blob.url,
      originalName: v.name,
      contentType: 'application/pdf',
      byteSize: PDF.length,
    });
    console.log('OK', row.vendor_id, row.pathname, `id=${row.id}`);
  }
} finally {
  await closePool();
}
