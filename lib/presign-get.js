import { issueSignedToken, presignUrl, getDownloadUrl } from '@vercel/blob';

/** Short-lived private GET URL for a blob pathname. */
export async function presignPrivateGet(pathname, { ttlMs = 5 * 60 * 1000 } = {}) {
  const validUntil = Date.now() + ttlMs;
  const signed = await issueSignedToken({
    pathname,
    operations: ['get'],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(signed, {
    access: 'private',
    operation: 'get',
    pathname,
    validUntil,
    useCache: false,
  });
  return getDownloadUrl(presignedUrl);
}
