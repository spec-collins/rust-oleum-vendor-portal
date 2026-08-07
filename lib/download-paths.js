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

/** Turn a vendor slug into a readable fallback name. */
export function humanizeVendorId(vendorId) {
  return String(vendorId || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Browser download / display name: "{Vendor Name} template.xlsx"
 * e.g. "MPI Label System template.xlsx"
 */
export function vendorTemplateFilename(vendorName, vendorId) {
  const raw =
    String(vendorName || '').trim() ||
    humanizeVendorId(vendorId) ||
    'Vendor';
  const cleaned = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const base = cleaned.replace(/\.xlsx$/i, '').trim() || 'Vendor';
  // Avoid "… template template.xlsx" if name already ends with template
  const titled = /\btemplate$/i.test(base) ? base : `${base} template`;
  return `${titled}.xlsx`;
}

/** @deprecated Prefer vendorTemplateFilename(vendorName, vendorId). Kept for upload payload cleanup. */
export function safeExcelFilename(name, vendorId) {
  const base = String(name || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
    .slice(0, 180);
  if (base && /\.xlsx$/i.test(base) && !/^template\.xlsx$/i.test(base)) {
    return base;
  }
  return vendorTemplateFilename(null, vendorId);
}

/** Content-Disposition for forcing a friendly download name. */
export function contentDispositionAttachment(filename) {
  const safe = String(filename || 'download.xlsx')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/"/g, '');
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
