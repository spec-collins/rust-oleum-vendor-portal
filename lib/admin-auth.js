import { matchesSecret } from './signing.js';
import { getQuery } from './http.js';

export function getAdminToken(req) {
  const q = getQuery(req);
  const header = req.headers['x-admin-token'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  return String(q.get('token') || fromHeader || '').trim();
}

export function assertAdmin(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return { ok: false, status: 503, error: 'ADMIN_TOKEN is not configured.' };
  }
  if (!matchesSecret(getAdminToken(req), expected)) {
    return { ok: false, status: 401, error: 'Invalid admin token.' };
  }
  return { ok: true };
}
