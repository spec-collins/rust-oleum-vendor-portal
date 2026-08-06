import fs from 'node:fs';
import { loadLocalEnv } from '../lib/env.js';
import { signVendorId } from '../lib/signing.js';

/**
 * Usage:
 *   BASE_URL=https://your-host npm run links -- vendors.csv
 *
 * CSV columns: vendor_id, optional vendor_name
 * Output: vendor_id,vendor_name,link
 */

loadLocalEnv();

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run links -- <vendors.csv>');
  process.exit(1);
}

const baseUrl = process.env.BASE_URL;
if (!baseUrl) {
  console.error('BASE_URL is not set.');
  process.exit(1);
}

const secret = process.env.LINK_SIGNING_SECRET;
if (!secret) {
  console.error('Warning: LINK_SIGNING_SECRET is not set, so links will be unsigned.');
}

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

const text = fs.readFileSync(inputPath, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
if (!lines.length) {
  console.error('CSV is empty.');
  process.exit(1);
}

let start = 0;
let idIdx = 0;
let nameIdx = 1;
const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
if (header.includes('vendor_id') || header.includes('vendorid')) {
  idIdx = header.findIndex((h) => h === 'vendor_id' || h === 'vendorid');
  nameIdx = header.findIndex((h) => h === 'vendor_name' || h === 'name');
  start = 1;
}

console.log('vendor_id,vendor_name,link');
for (let i = start; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  const vendorId = cols[idIdx];
  if (!vendorId) continue;
  const vendorName = nameIdx >= 0 ? cols[nameIdx] || '' : '';
  const url = new URL(baseUrl.replace(/\/+$/, '') + '/');
  url.searchParams.set('vid', vendorId);
  if (vendorName) url.searchParams.set('name', vendorName);
  if (secret) url.searchParams.set('t', signVendorId(vendorId, secret));
  const safeName = `"${vendorName.replace(/"/g, '""')}"`;
  console.log(`${vendorId},${safeName},${url.toString()}`);
}
