import { matchesSecret } from './signing.js';
import { getQuery } from './http.js';

/** Token for Spec Management System pull (Joel / SMS). */
export function getSmsPullToken(req) {
  const q = getQuery(req);
  const header = req.headers['x-sms-token'] || req.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  let fromHeader = String(raw || '').trim();
  if (/^bearer\s+/i.test(fromHeader)) {
    fromHeader = fromHeader.replace(/^bearer\s+/i, '').trim();
  }
  return String(q.get('token') || fromHeader || '').trim();
}

/**
 * Prefer SMS_PULL_TOKEN; fall back to ADMIN_TOKEN so ops can test
 * before a dedicated SMS credential is issued.
 */
export function assertSmsPull(req) {
  const expected =
    process.env.SMS_PULL_TOKEN || process.env.ADMIN_TOKEN || '';
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'SMS_PULL_TOKEN (or ADMIN_TOKEN) is not configured.',
    };
  }
  if (!matchesSecret(getSmsPullToken(req), expected)) {
    return { ok: false, status: 401, error: 'Invalid SMS pull token.' };
  }
  return { ok: true };
}
