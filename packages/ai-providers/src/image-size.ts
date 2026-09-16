/**
 * Map UI ratio / resolution / catalog sizes → provider `size`.
 *
 * - Catalog `sizes` (WxH): pick best match for ratio (+ resolution tier).
 * - Ratio + resolution, no catalog sizes: Seedream recommended WxH tables.
 * - Resolution only (no ratio): pass keyword like "2K".
 */

const FLEXIBLE = new Set(["auto", "adaptive", "keep"]);

const SIZE_2K: Record<string, string> = {
  "1:1": "2048x2048",
  "4:3": "2304x1728",
  "3:4": "1728x2304",
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "3:2": "2496x1664",
  "2:3": "1664x2496",
  "21:9": "3024x1296",
};

const SIZE_1K: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "3:2": "1248x832",
  "2:3": "832x1248",
  "21:9": "1512x648",
};

const SIZE_3K: Record<string, string> = {
  "1:1": "3072x3072",
  "4:3": "3456x2592",
  "3:4": "2592x3456",
  "16:9": "4096x2304",
  "9:16": "2304x4096",
  "3:2": "3744x2496",
  "2:3": "2496x3744",
  "21:9": "4704x2016",
};

const SIZE_4K: Record<string, string> = {
  "1:1": "4096x4096",
  "4:3": "4704x3520",
  "3:4": "3520x4704",
  "16:9": "5504x3040",
  "9:16": "3040x5504",
  "3:2": "4992x3328",
  "2:3": "3328x4992",
  "21:9": "6240x2656",
};

function normalizeResolution(raw?: string): string | undefined {
  if (!raw?.trim()) return undefined;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (key === "1k") return "1K";
  if (key === "1.5k" || key === "1_5k") return "1.5K";
  if (key === "2k") return "2K";
  if (key === "3k") return "3K";
  if (key === "4k") return "4K";
  return raw.trim();
}

function tableFor(resolution: string): Record<string, string> | null {
  switch (resolution) {
    case "1K":
    case "1.5K":
      return SIZE_1K;
    case "2K":
      return SIZE_2K;
    case "3K":
      return SIZE_3K;
    case "4K":
      return SIZE_4K;
    default:
      return null;
  }
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function ratioOf(width: number, height: number): string {
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

function parseWxH(raw: string): { width: number; height: number } | null {
  const m = raw.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return null;
  return { width, height };
}

/** Target long-side pixels for a resolution tier (for picking among catalog sizes). */
function resolutionLongSide(resolution?: string): number | null {
  const r = normalizeResolution(resolution);
  if (!r) return null;
  if (r === "1K" || r === "1.5K") return 1024;
  if (r === "2K") return 2048;
  if (r === "3K") return 3072;
  if (r === "4K") return 4096;
  const p = r.toLowerCase().match(/^(\d+)p$/);
  if (p) return Number(p[1]);
  return null;
}

function pickCatalogSize(
  catalogSizes: string[],
  ratio?: string,
  resolution?: string,
): string | null {
  const parsed = catalogSizes
    .map((raw) => {
      const wh = parseWxH(raw);
      if (!wh) return null;
      return { raw: `${wh.width}x${wh.height}`, ...wh };
    })
    .filter(Boolean) as Array<{ raw: string; width: number; height: number }>;

  if (!parsed.length) return null;

  let pool = parsed;
  if (ratio && !FLEXIBLE.has(ratio.toLowerCase())) {
    const matched = parsed.filter((s) => ratioOf(s.width, s.height) === ratio);
    if (matched.length) pool = matched;
  }

  const target = resolutionLongSide(resolution);
  if (target != null && pool.length > 1) {
    pool = [...pool].sort(
      (a, b) =>
        Math.abs(Math.max(a.width, a.height) - target) -
        Math.abs(Math.max(b.width, b.height) - target),
    );
  }

  return pool[0]?.raw ?? null;
}

export function resolveImageSize(params: {
  size?: string;
  width?: number;
  height?: number;
  ratio?: string;
  resolution?: string;
  /** Model catalog sizes like 1024x1024 — preferred when present. */
  catalogSizes?: string[];
  /**
   * keyword: prefer "2K" when no ratio / flexible ratio
   * pixels: always try WxH (catalog or recommended table)
   */
  mode?: "keyword" | "pixels" | "auto";
  fallback?: string;
}): string {
  if (params.size?.trim()) return params.size.trim();
  if (params.width && params.height) {
    return `${params.width}x${params.height}`;
  }

  const resolution = normalizeResolution(params.resolution);
  const ratio = params.ratio?.trim();
  const mode = params.mode ?? "auto";
  const flexible = ratio ? FLEXIBLE.has(ratio.toLowerCase()) : true;

  if (params.catalogSizes?.length) {
    const picked = pickCatalogSize(params.catalogSizes, ratio, resolution);
    if (picked) return picked;
  }

  const wantPixels =
    mode === "pixels" ||
    (mode === "auto" && ratio && !flexible) ||
    Boolean(params.catalogSizes?.length);

  if (wantPixels && resolution && ratio && !flexible) {
    const table = tableFor(resolution);
    if (table?.[ratio]) return table[ratio];
  }

  if (wantPixels && ratio && !flexible && !resolution) {
    const table = SIZE_2K;
    if (table[ratio]) return table[ratio];
  }

  // No ratio / flexible: Seedream-style keyword
  if (resolution && tableFor(resolution)) return resolution;
  if (resolution) return resolution;

  return params.fallback ?? "2K";
}
