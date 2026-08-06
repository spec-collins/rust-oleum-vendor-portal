import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadPathname,
  parseUploadPathname,
  isAllowedUploadFilename,
  vendorIdFromUploadPath,
} from '../lib/upload-paths.js';

test('allows pdf/docx only', () => {
  assert.equal(isAllowedUploadFilename('a.pdf'), true);
  assert.equal(isAllowedUploadFilename('a.DOCX'), true);
  assert.equal(isAllowedUploadFilename('a.xlsx'), false);
});

test('build and parse upload pathname', () => {
  const path = buildUploadPathname('mpi-label-systems', 'Spec Sheet (Final).PDF', '11111111-1111-1111-1111-111111111111');
  assert.equal(
    path,
    'uploads/mpi-label-systems/11111111-1111-1111-1111-111111111111-Spec Sheet (Final).pdf'
  );
  const parsed = parseUploadPathname(path);
  assert.equal(parsed.vendor_id, 'mpi-label-systems');
  assert.equal(parsed.ext, '.pdf');
  assert.equal(vendorIdFromUploadPath(path), 'mpi-label-systems');
  assert.equal(vendorIdFromUploadPath('downloads/x/template.xlsx'), null);
});
