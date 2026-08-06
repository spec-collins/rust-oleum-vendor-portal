import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { parseDashboardWorkbook } from '../lib/dashboard-xlsx.js';
import { slugVendorId } from '../lib/vendor-id.js';

const FIXTURE = path.join(
  'C:',
  'Users',
  'david',
  'Desktop',
  'Rust-Oleum',
  'Vendor Portal Build',
  'Rust-Oleum_Cleaners_Vendor_Dashboard_Data.xlsx'
);

test('slugVendorId is stable', () => {
  assert.equal(slugVendorId('FSG Holdco (Fortis Solutions Group)'), 'fsg-holdco-fortis-solutions-group');
  assert.equal(slugVendorId('Packaging Corporation of America'), 'packaging-corporation-of-america');
});

test('parses Cleaners dashboard one-pager', () => {
  const { vendors } = parseDashboardWorkbook(FIXTURE);
  assert.equal(vendors.length, 50);
  const top = vendors[0];
  assert.equal(top.vendor_name, 'Packaging Corporation of America');
  assert.equal(top.vendor_id, 'packaging-corporation-of-america');
  assert.equal(top.dashboard.total_specs_estimated, 61);
  assert.equal(top.dashboard.sap_numbers, 61);
  assert.equal(top.dashboard.specs_by_type.Carton, 61);
  assert.equal(top.dashboard.pct_epr_ready, 0);

  const mpi = vendors.find((v) => v.vendor_id === 'mpi-label-systems');
  assert.ok(mpi);
  assert.equal(mpi.dashboard.total_specs_estimated, 55);
  assert.equal(mpi.dashboard.specs_by_type.Label, 54);
  assert.equal(mpi.dashboard.specs_by_type.Other, 1);
});
