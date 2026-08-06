import { query, UNDEFINED_TABLE, resolveConnectionString } from '../lib/db.js';
import { verifyVendorToken } from '../lib/signing.js';
import { sendJson, getQuery } from '../lib/http.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
  ALLOWED_UPLOAD_EXTENSIONS,
} from '../lib/limits.js';

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function emptyMetrics() {
  return [1, 2, 3, 4, 5].map((n) => ({
    key: `metric_${n}`,
    label: `Metric ${n}`,
    value: null,
  }));
}

/**
 * Signed-link bootstrap for the vendor portal.
 * Phase 1: identity + empty metrics + feature flags.
 * Phase 2+: fills metrics / download / upload counts from DB.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const q = getQuery(req);
  const vendorId = clean(q.get('vid'), 128);
  const vendorName = clean(q.get('name'), 200) || null;
  const token = clean(q.get('t'), 128);

  if (!vendorId) {
    return sendJson(res, 400, { ok: false, error: 'vid is required.' });
  }

  const signingSecret = process.env.LINK_SIGNING_SECRET;
  if (signingSecret && !verifyVendorToken(vendorId, token, signingSecret)) {
    return sendJson(res, 403, { ok: false, error: 'Invalid or missing link token.' });
  }

  let metrics = emptyMetrics();
  let downloadReady = false;
  let uploadCount = 0;
  let response = null;

  if (!resolveConnectionString()) {
    return sendJson(res, 200, {
      ok: true,
      vendor_id: vendorId,
      vendor_name: vendorName,
      metrics,
      download_ready: false,
      upload: {
        count: 0,
        max_files: MAX_UPLOAD_FILES_PER_VENDOR,
        max_bytes_per_file: MAX_UPLOAD_BYTES_PER_FILE,
        allowed_extensions: ALLOWED_UPLOAD_EXTENSIONS,
      },
      response: null,
      phases: { metrics: true, download: false, upload: false },
      db: false,
    });
  }

  try {
    const metricsResult = await query(
      `SELECT vendor_name,
              metric_1_label, metric_1_value,
              metric_2_label, metric_2_value,
              metric_3_label, metric_3_value,
              metric_4_label, metric_4_value,
              metric_5_label, metric_5_value
         FROM vendor_metrics WHERE vendor_id = $1`,
      [vendorId]
    );
    if (metricsResult.rows[0]) {
      const row = metricsResult.rows[0];
      metrics = [1, 2, 3, 4, 5].map((n) => ({
        key: `metric_${n}`,
        label: row[`metric_${n}_label`] || `Metric ${n}`,
        value: row[`metric_${n}_value`],
      }));
    }

    const dl = await query(
      `SELECT filename FROM vendor_download_files WHERE vendor_id = $1`,
      [vendorId]
    );
    downloadReady = Boolean(dl.rows[0]);

    const ups = await query(
      `SELECT count(*)::int AS n FROM vendor_uploads WHERE vendor_id = $1`,
      [vendorId]
    );
    uploadCount = ups.rows[0]?.n || 0;

    const resp = await query(
      `SELECT choice, choice_label, timeframe, timeframe_label
         FROM vendor_responses WHERE vendor_id = $1`,
      [vendorId]
    );
    if (resp.rows[0]) response = resp.rows[0];
  } catch (err) {
    if (err && err.code !== UNDEFINED_TABLE) {
      console.error('portal lookup failed:', err);
      return sendJson(res, 503, { ok: false, error: 'Database is unreachable.' });
    }
    // Tables missing: still allow shell preview when signing passes.
  }

  return sendJson(res, 200, {
    ok: true,
    vendor_id: vendorId,
    vendor_name: vendorName,
    metrics,
    download_ready: downloadReady,
    upload: {
      count: uploadCount,
      max_files: MAX_UPLOAD_FILES_PER_VENDOR,
      max_bytes_per_file: MAX_UPLOAD_BYTES_PER_FILE,
      allowed_extensions: ALLOWED_UPLOAD_EXTENSIONS,
    },
    response,
    phases: {
      metrics: true,
      download: false,
      upload: false,
    },
  });
}
