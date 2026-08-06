import crypto from 'node:crypto';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  ALLOWED_UPLOAD_MIME,
} from './limits.js';
import { isValidVendorId } from './download-paths.js';

const UPLOAD_PATH_RE =
  /^uploads\/([a-z0-9][a-z0-9-]{0,126})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([^/]+)\.(pdf|docx)$/i;

export function extensionOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(String(filename || ''));
  return m ? `.${m[1].toLowerCase()}` : '';
}

export function isAllowedUploadFilename(filename) {
  return ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(filename));
}

export function isAllowedUploadMime(mime) {
  if (!mime) return true; // browsers sometimes omit; extension still enforced
  const normalized = String(mime).toLowerCase().split(';')[0].trim();
  return (
    ALLOWED_UPLOAD_MIME.includes(normalized) ||
    normalized === 'application/octet-stream'
  );
}

/** Sanitize original basename (no path, no extension). */
export function safeUploadBasename(filename) {
  const base = String(filename || 'document')
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\- ()[\]]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'document';
}

export function buildUploadPathname(vendorId, originalName, id = crypto.randomUUID()) {
  if (!isValidVendorId(vendorId)) throw new Error('Invalid vendor_id.');
  const ext = extensionOf(originalName);
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    throw new Error('Only PDF and DOCX files are allowed.');
  }
  const safe = safeUploadBasename(originalName);
  return `uploads/${vendorId}/${id}-${safe}${ext}`;
}

export function parseUploadPathname(pathname) {
  const m = UPLOAD_PATH_RE.exec(String(pathname || ''));
  if (!m) return null;
  return {
    vendor_id: m[1],
    uuid: m[2],
    basename: m[3],
    ext: `.${m[4].toLowerCase()}`,
  };
}

export function vendorIdFromUploadPath(pathname) {
  return parseUploadPathname(pathname)?.vendor_id || null;
}
