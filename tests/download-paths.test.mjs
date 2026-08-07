import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downloadPathname,
  isValidVendorId,
  vendorIdFromDownloadPath,
  vendorTemplateFilename,
  humanizeVendorId,
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

test('download filename uses vendor name + template', () => {
  assert.equal(
    vendorTemplateFilename('MPI Label System', 'mpi-label-systems'),
    'MPI Label System template.xlsx'
  );
  assert.equal(
    vendorTemplateFilename('Packaging Corporation of America', 'pca'),
    'Packaging Corporation of America template.xlsx'
  );
  assert.equal(
    vendorTemplateFilename(null, 'mpi-label-systems'),
    'Mpi Label Systems template.xlsx'
  );
  assert.equal(humanizeVendorId('mpi-label-systems'), 'Mpi Label Systems');
});
