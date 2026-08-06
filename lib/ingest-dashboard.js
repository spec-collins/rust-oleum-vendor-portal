import { query } from './db.js';
import { parseDashboardWorkbook } from './dashboard-xlsx.js';

export async function ingestDashboardWorkbook(bufferOrPath) {
  const parsed = parseDashboardWorkbook(bufferOrPath);
  let upserted = 0;

  for (const vendor of parsed.vendors) {
    await query(
      `INSERT INTO vendor_metrics (vendor_id, vendor_name, rank, dashboard, ingested_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (vendor_id) DO UPDATE SET
         vendor_name = EXCLUDED.vendor_name,
         rank = EXCLUDED.rank,
         dashboard = EXCLUDED.dashboard,
         ingested_at = now()`,
      [
        vendor.vendor_id,
        vendor.vendor_name,
        vendor.rank,
        JSON.stringify(vendor.dashboard),
      ]
    );
    upserted += 1;
  }

  return {
    ok: true,
    sheet: parsed.sheetName,
    upserted,
    vendors: parsed.vendors.map((v) => ({
      vendor_id: v.vendor_id,
      vendor_name: v.vendor_name,
      total_specs_estimated: v.dashboard.total_specs_estimated,
    })),
  };
}
