const VENDOR_ID_RE = /^[a-z0-9][a-z0-9-]{0,126}$/;

export function isValidVendorId(vendorId) {
  return typeof vendorId === 'string' && VENDOR_ID_RE.test(vendorId);
}

/** One replaceable template path per vendor. */
export function downloadPathname(vendorId) {
  if (!isValidVendorId(vendorId)) {
    throw new Error('Invalid vendor_id.');
  }
  return `downloads/${vendorId}/template.xlsx`;
}

export function vendorIdFromDownloadPath(pathname) {
  const m = /^downloads\/([a-z0-9][a-z0-9-]{0,126})\/template\.xlsx$/.exec(String(pathname || ''));
  return m ? m[1] : null;
}

export function safeExcelFilename(name, vendorId) {
  const base = String(name || 'template.xlsx')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/]/g, '-')
    .trim()
    .slice(0, 180);
  if (/\.xlsx$/i.test(base)) return base;
  return `${vendorId || 'vendor'}-template.xlsx`;
}
