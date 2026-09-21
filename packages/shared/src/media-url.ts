/**
 * Volcengine TOS image process helpers.
 * Lists use processed thumbs; lightbox / download / canvas keep the original URL.
 *
 * @see Volcengine TOS docs — `x-tos-process=image/resize,w_N/format,webp`
 */

export type MediaThumbSize = "sm" | "md" | "lg";

const THUMB_WIDTH: Record<MediaThumbSize, number> = {
  sm: 320,
  md: 640,
  lg: 960,
};

function parseHttpUrl(url: string): { host: string; pathname: string } | null {
  const match = String(url)
    .trim()
    .match(/^https?:\/\/([^/?#]+)([^?#]*)/i);
  if (!match?.[1]) return null;
  return {
    host: match[1].toLowerCase(),
    pathname: match[2] || "/",
  };
}

/** Hosts / paths that can accept TOS (or ImageX-compatible) process query. */
export function isTosProcessableUrl(url: string): boolean {
  const trimmed = String(url ?? "").trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return false;
  if (/[?&]x-tos-process=/i.test(trimmed) || /[?&]x-oss-process=/i.test(trimmed)) {
    return false;
  }
  const parsed = parseHttpUrl(trimmed);
  if (!parsed) return false;
  const { host, pathname } = parsed;
  if (host.includes("volces.com") || host.includes("volccdn.com")) return true;
  if (/\.tos[-.]/i.test(host) || host.startsWith("tos-")) return true;
  // Custom public base in front of TOS (still try; UI falls back to original)
  if (pathname.includes("/uploads/by-hash/")) return true;
  return false;
}

function pathOf(url: string): string {
  const parsed = parseHttpUrl(url);
  return (parsed?.pathname ?? url).toLowerCase();
}

function isLikelyVideo(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\/?|$)/i.test(pathOf(url));
}

function isLikelyRasterImage(url: string): boolean {
  const path = pathOf(url);
  if (/\.(mp4|webm|mov|m4v|mp3|wav|ogg|flac|aac|pdf|json|txt)(\/?|$)/i.test(path)) {
    return false;
  }
  return true;
}

/**
 * Append TOS image process params for list/grid thumbs.
 * Non-TOS / video / already-processed URLs are returned unchanged.
 */
export function tosThumbUrl(
  url: string | null | undefined,
  size: MediaThumbSize = "md",
): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  if (!isTosProcessableUrl(raw) || !isLikelyRasterImage(raw)) return raw;
  const w = THUMB_WIDTH[size] ?? THUMB_WIDTH.md;
  // Keep the process chain minimal — quality variants differ by product line
  // and a bad param can 400 the whole object (broken <img> in asset grids).
  const process = `image/resize,w_${w}/format,webp`;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}x-tos-process=${process}`;
}

/**
 * TOS video snapshot for list posters. Empty when the URL is not a TOS video
 * (caller should keep the original player, not this string).
 * Preview / download still use the raw mp4.
 */
export function tosVideoPosterUrl(
  url: string | null | undefined,
  size: MediaThumbSize = "md",
): string {
  const raw = String(url ?? "").trim();
  if (!raw || !isTosProcessableUrl(raw) || !isLikelyVideo(raw)) return "";
  const w = THUMB_WIDTH[size] ?? THUMB_WIDTH.md;
  const process = `video/snapshot,t_0,w_${w},f_jpg,m_fast`;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}x-tos-process=${process}`;
}

/** Prefer API `thumbUrl`, else derive from original. */
export function assetListImageUrl(input: {
  url?: string | null;
  thumbUrl?: string | null;
  kind?: string | null;
  size?: MediaThumbSize;
}): string {
  const kind = input.kind?.toLowerCase();
  if (kind && kind !== "image") return String(input.url ?? "").trim();
  const thumb = String(input.thumbUrl ?? "").trim();
  if (thumb) return thumb;
  return tosThumbUrl(input.url, input.size ?? "md");
}
