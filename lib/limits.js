/** Product limits locked for v1 (adjust with David before campaign). */
export const MAX_UPLOAD_FILES_PER_VENDOR = 500;
export const MAX_UPLOAD_BYTES_PER_FILE = 25 * 1024 * 1024; // 25 MB default
export const ALLOWED_UPLOAD_EXTENSIONS = ['.pdf', '.docx'];
export const ALLOWED_UPLOAD_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
