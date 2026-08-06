import { verifyVendorToken } from './signing.js';
import { isValidVendorId } from './download-paths.js';

export function assertVendorAccess({ vendorId, token }) {
  const id = String(vendorId || '').trim();
  if (!isValidVendorId(id)) {
    return { ok: false, status: 400, error: 'Invalid vendor_id.' };
  }

  const signingSecret = process.env.LINK_SIGNING_SECRET;
  if (signingSecret && !verifyVendorToken(id, token, signingSecret)) {
    return { ok: false, status: 403, error: 'Invalid or missing link token.' };
  }

  return { ok: true, vendorId: id };
}
