const BLOB_STREAM_PREFIX = '/api/videostreaming/blob';

export function toBlobStreamUrl(relativePath = '') {
  const normalized = String(relativePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  if (!normalized) return '';

  const encoded = normalized
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return encoded ? `${BLOB_STREAM_PREFIX}/${encoded}` : '';
}
