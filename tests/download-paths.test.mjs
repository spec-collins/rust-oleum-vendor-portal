import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadPathname,
  isValidVendorId,
  vendorIdFromDownloadPath,
} from '../lib/download-paths.js';

test('download path is scoped to vendor slug', () => {
  assert.equal(isValidVendorId('mpi-label-systems'), true);
  assert.equal(isValidVendorId('../evil'), false);
  assert.equal(
    downloadPathname('mpi-label-systems'),
    'downloads/mpi-label-systems/template.xlsx'
  );
  assert.equal(
    vendorIdFromDownloadPath('downloads/mpi-label-systems/template.xlsx'),
    'mpi-label-systems'
  );
  assert.equal(
    vendorIdFromDownloadPath('downloads/other/template.xlsx'),
    'other'
  );
  assert.equal(vendorIdFromDownloadPath('uploads/mpi-label-systems/a.pdf'), null);
});
