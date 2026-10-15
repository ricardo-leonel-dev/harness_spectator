export const DEFAULT_RETURN_URL = '/';

export function safeReturnUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_URL;
  if (!raw.startsWith('/')) return DEFAULT_RETURN_URL;
  if (raw[1] === '/' || raw[1] === '\\') return DEFAULT_RETURN_URL;
  if (/^\/login(?:[/?#]|$)/.test(raw)) return DEFAULT_RETURN_URL;
  return raw;
}
