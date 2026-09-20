/** Hosts whose public URLs often fail in Chrome (`ERR_HTTP2_PROTOCOL_ERROR`). */
const PROXY_HOST_RE =
  /(^|\.)toapis\.cn$/i;

/**
 * Whether a remote media URL should be loaded via `/media/fetch` instead of
 * the browser hitting the CDN directly. Not a CORS issue — ToAPIs/Qiniu
 * frequently resets HTTP/2 mid-body on multi‑MB images.
 */
export function needsMediaProxy(url: string): boolean {
  const trimmed = String(url ?? "").trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return false;
  }
  if (!/^https?:\/\//i.test(trimmed)) return false;
  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    return PROXY_HOST_RE.test(host);
  } catch {
    return false;
  }
}
