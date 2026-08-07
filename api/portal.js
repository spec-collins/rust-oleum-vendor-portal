import { query, UNDEFINED_TABLE, resolveConnectionString } from '../lib/db.js';
import { verifyVendorToken } from '../lib/signing.js';
import { sendJson, getQuery } from '../lib/http.js';
import {
  MAX_UPLOAD_BYTES_PER_FILE,
  MAX_UPLOAD_FILES_PER_VENDOR,
  ALLOWED_UPLOAD_EXTENSIONS,
} from '../lib/limits.js';
import { getExplainerVideo } from '../lib/explainer-video.js';

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function emptyDashboard() {
  return {
    total_specs_estimated: null,
    specs_by_type_summary: '',
    specs_by_type: {},
    sap_numbers: null,
    specs_in_specright: null,
    pct_in_specright: null,
    specs_with_weight: null,
    pct_with_weight: null,
    specs_with_material: null,
    pct_with_material: null,
    specs_with_pcr: null,
    pct_with_pcr: null,
    specs_epr_ready: null,
    pct_epr_ready: null,
    division: 'Cleaners',
    spec_definition: 'Drawing / die line',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const q = getQuery(req);
  const vendorId = clean(q.get('vid'), 128);
  const vendorNameFromLink = clean(q.get('name'), 200) || null;
  const token = clean(q.get('t'), 128);

  if (!vendorId) {
    return sendJson(res, 400, { ok: false, error: 'vid is required.' });
  }

  const signingSecret = process.env.LINK_SIGNING_SECRET;
  if (signingSecret && !verifyVendorToken(vendorId, token, signingSecret)) {
    return sendJson(res, 403, { ok: false, error: 'Invalid or missing link token.' });
  }

  let vendorName = vendorNameFromLink;
  let dashboard = emptyDashboard();
  let hasMetrics = false;
  let downloadReady = false;
  let uploadCount = 0;
  let response = null;
  let explainerReady = false;

  const uploadMeta = {
    count: 0,
    max_files: MAX_UPLOAD_FILES_PER_VENDOR,
    max_bytes_per_file: MAX_UPLOAD_BYTES_PER_FILE,
    allowed_extensions: ALLOWED_UPLOAD_EXTENSIONS,
  };

  if (!resolveConnectionString()) {
    return sendJson(res, 200, {
      ok: true,
      vendor_id: vendorId,
      vendor_name: vendorName,
      has_metrics: false,
      dashboard,
      download_ready: false,
      explainer_video_ready: false,
      upload: uploadMeta,
      response: null,
      phases: { metrics: true, download: true, upload: true, explainer: true },
      db: false,
    });
  }

  try {
    const metricsResult = await query(
      `SELECT vendor_name, dashboard FROM vendor_metrics WHERE vendor_id = $1`,
      [vendorId]
    );
    if (metricsResult.rows[0]) {
      hasMetrics = true;
      vendorName = metricsResult.rows[0].vendor_name || vendorName;
      const raw = metricsResult.rows[0].dashboard;
      dashboard = { ...emptyDashboard(), ...(typeof raw === 'string' ? JSON.parse(raw) : raw) };
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
      `SELECT choice, choice_label, choice_submitted_at,
              timeframe, timeframe_label, timeframe_submitted_at
         FROM vendor_responses WHERE vendor_id = $1`,
      [vendorId]
    );
    if (resp.rows[0]) response = resp.rows[0];

    try {
      const explainer = await getExplainerVideo();
      explainerReady = Boolean(explainer?.pathname);
    } catch (mediaErr) {
      if (mediaErr && mediaErr.code !== UNDEFINED_TABLE) throw mediaErr;
    }
  } catch (err) {
    if (err && err.code !== UNDEFINED_TABLE) {
      console.error('portal lookup failed:', err);
      return sendJson(res, 503, { ok: false, error: 'Database is unreachable.' });
    }
  }

  return sendJson(res, 200, {
    ok: true,
    vendor_id: vendorId,
    vendor_name: vendorName,
    has_metrics: hasMetrics,
    dashboard,
    download_ready: downloadReady,
    explainer_video_ready: explainerReady,
    upload: { ...uploadMeta, count: uploadCount },
    response,
    phases: {
      metrics: true,
      download: true,
      upload: true,
      explainer: true,
    },
  });
}
