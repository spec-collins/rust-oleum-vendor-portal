import XLSX from 'xlsx';
import { slugVendorId } from './vendor-id.js';

const TYPE_COLUMNS = [
  'Label',
  'Shrink Sleeve Film',
  'Carton',
  'Bottle',
  'Cap Closure',
  'Trigger Pump',
  'Can',
  'Pail',
  'Actuator',
  'Valve',
  'Other',
];

function num(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function pct(value) {
  const n = num(value);
  // Excel may store 0.25 or 25; treat >1 as already-percent.
  if (n > 1) return Math.round(n * 10) / 10;
  return Math.round(n * 1000) / 10;
}

/**
 * Parse the Cleaners vendor dashboard one-pager into DB-ready rows.
 * Ignores footnote rows and rows without a Vendor name / rank #.
 */
export function parseDashboardWorkbook(bufferOrPath) {
  const wb =
    typeof bufferOrPath === 'string'
      ? XLSX.readFile(bufferOrPath)
      : XLSX.read(bufferOrPath, { type: Buffer.isBuffer(bufferOrPath) ? 'buffer' : 'array' });

  const sheetName = wb.SheetNames.includes('Vendor Dashboard Data')
    ? 'Vendor Dashboard Data'
    : wb.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets.');

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
  const vendors = [];
  const seen = new Set();

  for (const row of rows) {
    const vendorName = row.Vendor != null ? String(row.Vendor).trim() : '';
    const rank = num(row['#']);
    if (!vendorName || !rank) continue;

    const vendorId = slugVendorId(vendorName);
    if (!vendorId) continue;
    if (seen.has(vendorId)) {
      throw new Error(`Duplicate vendor_id slug: ${vendorId}`);
    }
    seen.add(vendorId);

    const byType = {};
    for (const type of TYPE_COLUMNS) {
      const count = Math.round(num(row[`Specs: ${type}`]));
      if (count > 0) byType[type] = count;
    }

    vendors.push({
      vendor_id: vendorId,
      vendor_name: vendorName,
      rank: Math.round(rank),
      dashboard: {
        total_specs_estimated: Math.round(num(row['Total Specs We Estimate You Supply'])),
        specs_by_type_summary: row['Specs by Packaging Type']
          ? String(row['Specs by Packaging Type']).trim()
          : '',
        specs_by_type: byType,
        sap_numbers: Math.round(num(row['Total SAP Numbers You Supply'])),
        specs_in_specright: Math.round(num(row['Specs Already in SpecRight'])),
        pct_in_specright: pct(row['Percent of Your Specs in SpecRight']),
        specs_with_weight: Math.round(num(row['Specs With a Weight Recorded'])),
        pct_with_weight: pct(row['Percent of Your Specs With a Weight']),
        specs_with_material: Math.round(num(row['Specs With a Material Recorded'])),
        pct_with_material: pct(row['Percent of Your Specs With a Material']),
        specs_with_pcr: Math.round(num(row['Specs With PCR Content Recorded'])),
        pct_with_pcr: pct(row['Percent of Your Specs With PCR Content']),
        specs_epr_ready: Math.round(
          num(row['Specs EPR Ready (Weight, Material and PCR All Recorded)'])
        ),
        pct_epr_ready: pct(row['Percent of Your Specs EPR Ready']),
        division: 'Cleaners',
        spec_definition: 'Drawing / die line',
      },
    });
  }

  return { sheetName, vendors, typeColumns: TYPE_COLUMNS };
}

export { TYPE_COLUMNS };
