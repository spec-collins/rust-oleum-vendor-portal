import { withTransaction, UNDEFINED_TABLE, query } from '../lib/db.js';
import { validateSubmission } from '../lib/validate.js';
import { verifyVendorToken, hashIp } from '../lib/signing.js';
import { sendJson, readJsonBody, clientIp } from '../lib/http.js';

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

async function isRateLimited(ipHash) {
  if (!ipHash) return false;
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM response_events
      WHERE ip_hash = $1 AND received_at > now() - ($2::text || ' milliseconds')::interval`,
    [ipHash, String(RATE_WINDOW_MS)]
  );
  return rows[0].n >= RATE_MAX;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const body = await readJsonBody(req);
  if (!body.ok) {
    return sendJson(res, body.status || 400, { ok: false, error: body.error });
  }

  const parsed = validateSubmission(body.value);
  if (!parsed.ok) {
    return sendJson(res, 400, { ok: false, error: parsed.error });
  }
  const submission = parsed.value;

  const signingSecret = process.env.LINK_SIGNING_SECRET;
  if (signingSecret && !verifyVendorToken(submission.vendor_id, submission.token, signingSecret)) {
    return sendJson(res, 403, { ok: false, error: 'Invalid or missing link token.' });
  }

  const ipHash = hashIp(clientIp(req), process.env.IP_HASH_SALT);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300) || null;

  try {
    if (await isRateLimited(ipHash)) {
      res.setHeader('Retry-After', '60');
      return sendJson(res, 429, { ok: false, error: 'Too many submissions. Try again shortly.' });
    }

    if (submission.stage === 'reset') {
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO response_events (vendor_id, stage, payload, ip_hash, user_agent)
           VALUES ($1, $2, $3::jsonb, $4, $5)`,
          [submission.vendor_id, 'reset', JSON.stringify(body.value), ipHash, userAgent]
        );
        await client.query(
          `UPDATE vendor_responses SET
             choice = NULL,
             choice_label = NULL,
             choice_submitted_at = NULL,
             timeframe = NULL,
             timeframe_label = NULL,
             timeframe_submitted_at = NULL,
             admin_status = NULL,
             last_updated_at = now()
           WHERE vendor_id = $1`,
          [submission.vendor_id]
        );
      });
      return sendJson(res, 200, { ok: true, reset: true });
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO response_events (vendor_id, stage, payload, ip_hash, user_agent)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [submission.vendor_id, submission.stage, JSON.stringify(body.value), ipHash, userAgent]
      );

      await client.query(
        `INSERT INTO vendor_responses (
           vendor_id, vendor_name,
           choice, choice_label, choice_submitted_at,
           timeframe, timeframe_label, timeframe_submitted_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (vendor_id) DO UPDATE SET
           vendor_name            = COALESCE(EXCLUDED.vendor_name, vendor_responses.vendor_name),
           choice                 = COALESCE(EXCLUDED.choice, vendor_responses.choice),
           choice_label           = COALESCE(EXCLUDED.choice_label, vendor_responses.choice_label),
           choice_submitted_at    = COALESCE(EXCLUDED.choice_submitted_at, vendor_responses.choice_submitted_at),
           timeframe              = COALESCE(EXCLUDED.timeframe, vendor_responses.timeframe),
           timeframe_label        = COALESCE(EXCLUDED.timeframe_label, vendor_responses.timeframe_label),
           timeframe_submitted_at = COALESCE(EXCLUDED.timeframe_submitted_at, vendor_responses.timeframe_submitted_at),
           last_updated_at        = now()`,
        [
          submission.vendor_id,
          submission.vendor_name,
          submission.choice,
          submission.choice_label,
          submission.choice_submitted_at,
          submission.timeframe,
          submission.timeframe_label,
          submission.timeframe_submitted_at,
        ]
      );
    });

    return sendJson(res, 200, { ok: true });
  } catch (err) {
    if (err && err.code === UNDEFINED_TABLE) {
      return sendJson(res, 503, {
        ok: false,
        error: 'Tables are missing. Run: npm run migrate',
      });
    }
    console.error('respond failed:', err);
    return sendJson(res, 500, { ok: false, error: 'Could not save response.' });
  }
}
