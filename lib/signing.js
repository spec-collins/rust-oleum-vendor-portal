import crypto from 'node:crypto';

const TOKEN_BYTES = 16;

export function signVendorId(vendorId, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(String(vendorId))
    .digest('base64url')
    .slice(0, Math.ceil((TOKEN_BYTES * 8) / 6));
}

export function verifyVendorToken(vendorId, token, secret) {
  if (!secret) return true;
  if (typeof token !== 'string' || !token) return false;

  const expected = Buffer.from(signVendorId(vendorId, secret));
  const provided = Buffer.from(token);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

export function matchesSecret(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashIp(ip, salt) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`${salt || ''}:${ip}`).digest('hex').slice(0, 32);
}
