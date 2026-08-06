import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, getQuery, readJsonBody } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';
import { adminResponseStatus, ADMIN_STATUSES } from '../lib/follow-up.js';
import { isValidVendorId } from '../lib/download-paths.js';

const SELECT_SQL = `
  SELECT
    m.vendor_id,
    m.vendor_name,
    m.rank,
    r.choice,
    r.choice_label,
    r.choice_submitted_at,
    r.timeframe,
    r.timeframe_label,
    r.timeframe_submitted_at,
    r.admin_status,
    r.first_seen_at,
    r.last_updated_at
  FROM vendor_metrics m
  LEFT JOIN vendor_responses r ON r.vendor_id = m.vendor_id
`;

const ORPHAN_SQL = `
  SELECT
    r.vendor_id,
    r.vendor_name,
    NULL::int AS rank,
    r.choice,
    r.choice_label,
    r.choice_submitted_at,
    r.timeframe,
    r.timeframe_label,
    r.timeframe_submitted_at,
    r.admin_status,
    r.first_seen_at,
    r.last_updated_at
  FROM vendor_responses r
  LEFT JOIN vendor_metrics m ON m.vendor_id = r.vendor_id
  WHERE m.vendor_id IS NULL
    AND r.choice IS NOT NULL
`;

/**
 * GET  — tracker JSON or CSV (follow-up dates + urgent assistance).
 * POST — set admin_status for assisted vendors (e.g. assistance_provided).
 */
export default async function handler(req, res) {
  if (req.method === 'POST') return postHandler(req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const { rows } = await query(
      `${SELECT_SQL}
       ORDER BY
         CASE
           WHEN r.choice = 'assisted' AND coalesce(r.admin_status, '') IS DISTINCT FROM 'assistance_provided' THEN 0
           WHEN r.choice IS NOT NULL AND r.timeframe IS NOT NULL THEN 1
           WHEN r.choice IS NOT NULL THEN 2
           ELSE 3
         END,
         r.last_updated_at DESC NULLS LAST,
         m.rank NULLS LAST,
         m.vendor_name`
    );
    const { rows: orphans } = await query(
      `${ORPHAN_SQL} ORDER BY r.last_updated_at DESC`
    );

    const responses = [...rows, ...orphans].map(serialize);
    const summary = {
      total_vendors: rows.length,
      urgent: responses.filter((r) => r.status === 'urgent').length,
      follow_up: responses.filter((r) => r.status === 'follow_up' || r.status === 'overdue').length,
      overdue: responses.filter((r) => r.status === 'overdue').length,
      assistance_provided: responses.filter((r) => r.status === 'assistance_provided').length,
      choice_only: responses.filter((r) => r.status === 'choice_only').length,
      no_response: responses.filter((r) => r.status === 'no_response').length,
    };

    const format = String(getQuery(req).get('format') || 'json').toLowerCase();
    if (format === 'csv') {
      const headers = [
        'vendor_id',
        'vendor_name',
        'rank',
        'status',
        'status_label',
        'follow_up_date',
        'overdue',
        'choice',
        'choice_label',
        'choice_submitted_at',
        'timeframe',
        'timeframe_label',
        'timeframe_submitted_at',
        'admin_status',
        'last_updated_at',
      ];
      const lines = [headers.join(',')];
      for (const r of responses) {
        lines.push(
          headers
            .map((h) => {
              if (h === 'status_label') return csvCell(r.status_label);
              if (h === 'overdue') return csvCell(r.overdue ? 'yes' : 'no');
              return csvCell(r[h]);
            })
            .join(',')
        );
      }
      const body = lines.join('\r\n');
      const stamp = new Date().toISOString().slice(0, 10);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="vendor-responses-${stamp}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.end(body);
    }

    return sendJson(res, 200, { ok: true, summary, responses });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-responses failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not load responses.' });
  }
}

async function postHandler(req, res) {
  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  const vendorId = String(body.value.vendor_id || '').trim();
  const adminStatus = String(body.value.admin_status || '').trim();

  if (!isValidVendorId(vendorId)) {
    return sendJson(res, 400, { ok: false, error: 'Invalid vendor_id.' });
  }
  if (!ADMIN_STATUSES.includes(adminStatus)) {
    return sendJson(res, 400, {
      ok: false,
      error: `admin_status must be one of: ${ADMIN_STATUSES.join(', ')}.`,
    });
  }

  try {
    const existing = await query(
      `SELECT vendor_id, choice FROM vendor_responses WHERE vendor_id = $1`,
      [vendorId]
    );
    if (!existing.rows[0]) {
      return sendJson(res, 404, { ok: false, error: 'No response row for that vendor.' });
    }
    if (existing.rows[0].choice !== 'assisted') {
      return sendJson(res, 400, {
        ok: false,
        error: 'admin_status can only be set for SpecInsite assistance responses.',
      });
    }

    await query(
      `UPDATE vendor_responses
          SET admin_status = $2, last_updated_at = now()
        WHERE vendor_id = $1`,
      [vendorId, adminStatus]
    );

    return sendJson(res, 200, { ok: true, vendor_id: vendorId, admin_status: adminStatus });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, { ok: false, error: 'Tables missing. Run npm run migrate.' });
    }
    console.error('admin-responses update failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not update status.' });
  }
}

function serialize(r) {
  const status = adminResponseStatus(r);
  return {
    vendor_id: r.vendor_id,
    vendor_name: r.vendor_name,
    rank: r.rank,
    status: status.key,
    status_label: status.label,
    follow_up_date: status.follow_up_date,
    overdue: status.overdue,
    choice: r.choice,
    choice_label: r.choice_label,
    choice_submitted_at: r.choice_submitted_at,
    timeframe: r.timeframe,
    timeframe_label: r.timeframe_label,
    timeframe_submitted_at: r.timeframe_submitted_at,
    admin_status: r.admin_status || null,
    first_seen_at: r.first_seen_at,
    last_updated_at: r.last_updated_at,
  };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const s = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
