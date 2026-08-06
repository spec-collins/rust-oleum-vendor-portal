import { assertAdmin } from '../lib/admin-auth.js';
import { sendJson, getQuery } from '../lib/http.js';
import { query, UNDEFINED_TABLE } from '../lib/db.js';

/**
 * Admin tracker: all ingested vendors + their portal response (if any).
 * GET ?format=csv → downloadable CSV
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const auth = assertAdmin(req);
  if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });

  try {
    const { rows } = await query(
      `SELECT
          m.vendor_id,
          m.vendor_name,
          m.rank,
          r.choice,
          r.choice_label,
          r.choice_submitted_at,
          r.timeframe,
          r.timeframe_label,
          r.timeframe_submitted_at,
          r.first_seen_at,
          r.last_updated_at,
          CASE
            WHEN r.choice IS NULL THEN 'no_response'
            WHEN r.timeframe IS NULL THEN 'choice_only'
            ELSE 'complete'
          END AS status
         FROM vendor_metrics m
         LEFT JOIN vendor_responses r ON r.vendor_id = m.vendor_id
         ORDER BY
           CASE
             WHEN r.choice IS NOT NULL AND r.timeframe IS NOT NULL THEN 0
             WHEN r.choice IS NOT NULL THEN 1
             ELSE 2
           END,
           r.last_updated_at DESC NULLS LAST,
           m.rank NULLS LAST,
           m.vendor_name`
    );

    // Also include response-only rows not in metrics (edge cases / smoke tests).
    const { rows: orphans } = await query(
      `SELECT
          r.vendor_id,
          r.vendor_name,
          NULL::int AS rank,
          r.choice,
          r.choice_label,
          r.choice_submitted_at,
          r.timeframe,
          r.timeframe_label,
          r.timeframe_submitted_at,
          r.first_seen_at,
          r.last_updated_at,
          CASE
            WHEN r.choice IS NULL THEN 'no_response'
            WHEN r.timeframe IS NULL THEN 'choice_only'
            ELSE 'complete'
          END AS status
         FROM vendor_responses r
         LEFT JOIN vendor_metrics m ON m.vendor_id = r.vendor_id
         WHERE m.vendor_id IS NULL
           AND r.choice IS NOT NULL
         ORDER BY r.last_updated_at DESC`
    );

    const responses = [...rows, ...orphans].map(serialize);
    const summary = {
      total_vendors: rows.length,
      complete: responses.filter((r) => r.status === 'complete').length,
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
        'choice',
        'choice_label',
        'choice_submitted_at',
        'timeframe',
        'timeframe_label',
        'timeframe_submitted_at',
        'last_updated_at',
      ];
      const lines = [headers.join(',')];
      for (const r of responses) {
        lines.push(headers.map((h) => csvCell(r[h])).join(','));
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

function serialize(r) {
  return {
    vendor_id: r.vendor_id,
    vendor_name: r.vendor_name,
    rank: r.rank,
    status: r.status,
    choice: r.choice,
    choice_label: r.choice_label,
    choice_submitted_at: r.choice_submitted_at,
    timeframe: r.timeframe,
    timeframe_label: r.timeframe_label,
    timeframe_submitted_at: r.timeframe_submitted_at,
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
