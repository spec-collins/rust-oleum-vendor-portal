import path from 'node:path';
import { loadLocalEnvChain } from '../lib/env.js';
import { closePool } from '../lib/db.js';
import { ingestDashboardWorkbook } from '../lib/ingest-dashboard.js';

loadLocalEnvChain();

const input =
  process.argv[2] ||
  path.join(
    'C:',
    'Users',
    'david',
    'Desktop',
    'Rust-Oleum',
    'Vendor Portal Build',
    'Rust-Oleum_Cleaners_Vendor_Dashboard_Data.xlsx'
  );

try {
  const result = await ingestDashboardWorkbook(input);
  console.log(JSON.stringify({ ok: true, sheet: result.sheet, upserted: result.upserted }, null, 2));
  for (const v of result.vendors.slice(0, 5)) {
    console.log(`  ${v.vendor_id}  specs=${v.total_specs_estimated}  (${v.vendor_name})`);
  }
  if (result.vendors.length > 5) console.log(`  … ${result.vendors.length - 5} more`);
} finally {
  await closePool();
}
