/** Prefer CN-friendly jsDelivr mirror (cdn.jsdelivr.net is often slow inland). */
const DEFAULT_STATIC_CDN =
  "https://cdn.jsdmirror.com/gh/toctong/image-hosting@main/joyai";

/**
 * Core chrome stays on local `public/` — brand, UI icons, loading.
 * CDN is for bulky content: tools covers, inspire stills, manju styles, camera demos.
 */
function isLocalOnlyAsset(path: string): boolean {
  const bare = (path.split("?")[0] ?? path).toLowerCase();
  if (/\.svg$/i.test(bare)) return true;
  return (
    bare.startsWith("/brand/") ||
    bare.startsWith("/icons/") ||
    bare.startsWith("/canvas-icons/") ||
    bare.startsWith("/loading/")
  );
}

/**
 * Resolve heavy static paths to CDN; core chrome always local.
 * - `NEXT_PUBLIC_STATIC_CDN=local` or empty → everything relative
 * - Unset env → CDN for non-core rasters
 */
export function staticAssetUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  // Already absolute (http/https/data) — leave alone.
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  if (isLocalOnlyAsset(p)) return p;

  const raw = process.env.NEXT_PUBLIC_STATIC_CDN;
  let base: string;
  if (raw === undefined) {
    base = DEFAULT_STATIC_CDN;
  } else {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.toLowerCase() === "local") {
      base = "";
    } else {
      base = trimmed.replace(/\/$/, "");
    }
  }
  if (!base) return p;
  return `${base}${p}`;
}

/** Map a list of public paths through {@link staticAssetUrl}. */
export function staticAssetUrls(paths: readonly string[]): string[] {
  return paths.map((p) => staticAssetUrl(p));
}
