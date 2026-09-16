import type { ModelCapabilities } from "@joyai/shared";

/** Fallback only when model has no capabilities catalogued at all. */
export const DEFAULT_ASPECTS = [
  { id: "1:1", label: "1:1", width: 1024, height: 1024 },
  { id: "16:9", label: "16:9", width: 1280, height: 720 },
  { id: "9:16", label: "9:16", width: 720, height: 1280 },
  { id: "4:3", label: "4:3", width: 1024, height: 768 },
  { id: "3:4", label: "3:4", width: 768, height: 1024 },
] as const;

const RATIO_BASE: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
  "3:2": { width: 1248, height: 832 },
  "2:3": { width: 832, height: 1248 },
  "21:9": { width: 1680, height: 720 },
};

const DEFAULT_IMAGE_RESOLUTIONS = ["1K", "2K"] as const;
const DEFAULT_VIDEO_RESOLUTIONS = ["720p", "1080p"] as const;
const DEFAULT_VIDEO_DURATIONS = [4, 5, 8, 10] as const;

export type AspectOption = {
  id: string;
  label: string;
  width: number;
  height: number;
  flexible?: boolean;
};

export type ResolutionOption = {
  id: string;
  label: string;
  scale: number;
};

export type SizeOption = {
  id: string;
  label: string;
  width: number;
  height: number;
};

/** How the selected model wants layout params expressed. */
export type LayoutControls = {
  /** Catalog is missing entirely → use built-in defaults. */
  legacyFallback: boolean;
  showRatio: boolean;
  showResolution: boolean;
  /** Discrete WxH chips when model only lists sizes (no ratios). */
  showSizePicker: boolean;
  showDuration: boolean;
  aspects: AspectOption[];
  resolutions: ResolutionOption[];
  sizes: SizeOption[];
  /**
   * Provider hint:
   * - keyword: pass 2K / 720p style
   * - pixels: need WxH (catalog sizes or ratio→table)
   */
  imageSizeMode: "keyword" | "pixels" | "auto" | "none";
};

export function parseSize(raw: string): { width: number; height: number } | null {
  const m = raw.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return null;
  }
  return { width, height };
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

export function ratioFromSize(width: number, height: number): string {
  const g = gcd(width, height);
  return `${width / g}:${height / g}`;
}

function normalizeRatioId(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

function isFlexibleRatio(id: string): boolean {
  const key = id.toLowerCase();
  return key === "auto" || key === "adaptive" || key === "keep";
}

function baseDimsForRatio(id: string): { width: number; height: number } {
  if (RATIO_BASE[id]) return RATIO_BASE[id];
  const m = id.match(/^(\d+):(\d+)$/);
  if (m) {
    const aw = Number(m[1]);
    const ah = Number(m[2]);
    if (aw > 0 && ah > 0) {
      const long = 1024;
      if (aw >= ah) {
        return {
          width: long,
          height: Math.max(64, Math.round((long * ah) / aw)),
        };
      }
      return {
        width: Math.max(64, Math.round((long * aw) / ah)),
        height: long,
      };
    }
  }
  return { width: 1024, height: 1024 };
}

export function resolveResolutionOption(raw: string): ResolutionOption {
  const id = raw.trim();
  const key = id.toLowerCase().replace(/\s+/g, "");
  const label = id.toUpperCase().includes("K")
    ? id.replace(/k/gi, "K")
    : id.toUpperCase().includes("P")
      ? id.replace(/p$/i, "P")
      : id;

  if (key === "1k" || key === "1024" || key === "1024p") {
    return { id, label: label || "1K", scale: 1 };
  }
  if (key === "1.5k" || key === "1_5k" || key === "1536") {
    return { id, label: label || "1.5K", scale: 1.5 };
  }
  if (key === "2k" || key === "2048") {
    return { id, label: label || "2K", scale: 2 };
  }
  if (key === "3k" || key === "3072") {
    return { id, label: label || "3K", scale: 3 };
  }
  if (key === "4k" || key === "4096" || key === "2160p") {
    return { id, label: label || "4K", scale: 4 };
  }
  if (key === "480p") return { id, label: "480P", scale: 1 };
  if (key === "720p") return { id, label: "720P", scale: 1 };
  if (key === "1080p") return { id, label: "1080P", scale: 1 };

  const px = key.match(/^(\d+)p$/);
  if (px) return { id, label: `${px[1]}P`, scale: 1 };

  return { id, label: id, scale: 1 };
}

function sizeOptionsFromCaps(caps?: ModelCapabilities | null): SizeOption[] {
  const out: SizeOption[] = [];
  const seen = new Set<string>();
  for (const raw of caps?.sizes ?? []) {
    const parsed = parseSize(raw);
    if (!parsed) continue;
    const id = `${parsed.width}x${parsed.height}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: id,
      width: parsed.width,
      height: parsed.height,
    });
  }
  return out;
}

function isKTierResolution(id: string): boolean {
  return /^(\d+(\.\d+)?k)$/i.test(id.trim().replace(/\s+/g, ""));
}

function ensureFlexibleRatioOption(
  ratios: string[],
  kind: "image" | "video",
  opts: { hasSizes: boolean; hasKResolutions: boolean },
): string[] {
  if (ratios.some(isFlexibleRatio)) return ratios;

  // Seedream-style: size="2K" + no fixed ratio → auto aspect from prompt
  if (kind === "image" && opts.hasKResolutions && !opts.hasSizes) {
    return ["auto", ...ratios];
  }

  // Video catalogs often use adaptive; add when ratios exist but none flexible
  if (kind === "video" && ratios.length > 0) {
    return ["adaptive", ...ratios];
  }

  return ratios;
}

function aspectsFromRatios(
  ratios: string[],
  sizes: SizeOption[],
  kind: "image" | "video",
): AspectOption[] {
  return ratios.map((id) => {
    if (isFlexibleRatio(id)) {
      const fallback = kind === "video" ? RATIO_BASE["16:9"] : RATIO_BASE["1:1"];
      return {
        id,
        label: id === "adaptive" ? "自适应" : id === "auto" ? "自动" : id,
        width: fallback.width,
        height: fallback.height,
        flexible: true,
      };
    }
    const fromSize = sizes.find((s) => ratioFromSize(s.width, s.height) === id);
    const base = fromSize
      ? { width: fromSize.width, height: fromSize.height }
      : baseDimsForRatio(id);
    return { id, label: id, width: base.width, height: base.height };
  });
}

function hasAnyLayoutMeta(caps?: ModelCapabilities | null): boolean {
  if (!caps) return false;
  return Boolean(
    (caps.ratios && caps.ratios.length) ||
      (caps.resolutions && caps.resolutions.length) ||
      (caps.sizes && caps.sizes.length) ||
      caps.maxDurationSec != null,
  );
}

/**
 * Derive which layout controls to show from model capabilities.
 * Missing catalog → legacy defaults. Explicit empty ratios → hide ratio.
 */
export function layoutControlsFromCapabilities(
  caps?: ModelCapabilities | null,
  kind: "image" | "video" = "image",
): LayoutControls {
  const legacyFallback = !hasAnyLayoutMeta(caps);
  const sizes = sizeOptionsFromCaps(caps);
  const rawRatioIds =
    caps?.ratios?.map(normalizeRatioId).filter(Boolean) ?? [];
  const resolutionIds =
    caps?.resolutions?.map((r) => r.trim()).filter(Boolean) ?? [];
  const hasKResolutions = resolutionIds.some(isKTierResolution);
  const ratioIds = ensureFlexibleRatioOption(rawRatioIds, kind, {
    hasSizes: sizes.length > 0,
    hasKResolutions,
  });

  if (legacyFallback) {
    const fallbackRatios =
      kind === "image"
        ? ["auto", ...DEFAULT_ASPECTS.map((a) => a.id)]
        : ["adaptive", ...DEFAULT_ASPECTS.map((a) => a.id)];
    return {
      legacyFallback: true,
      showRatio: true,
      showResolution: true,
      showSizePicker: false,
      showDuration: kind === "video",
      aspects: aspectsFromRatios(fallbackRatios, [], kind),
      resolutions: (
        kind === "image" ? DEFAULT_IMAGE_RESOLUTIONS : DEFAULT_VIDEO_RESOLUTIONS
      ).map(resolveResolutionOption),
      sizes: [],
      imageSizeMode: kind === "image" ? "keyword" : "keyword",
    };
  }

  const showRatio = ratioIds.length > 0;
  const showResolution = resolutionIds.length > 0;
  const showSizePicker = !showRatio && sizes.length > 0;
  const aspects = showRatio ? aspectsFromRatios(ratioIds, sizes, kind) : [];
  const resolutions = showResolution
    ? resolutionIds.map(resolveResolutionOption)
    : [];

  let imageSizeMode: LayoutControls["imageSizeMode"] = "none";
  if (kind === "image") {
    if (sizes.length > 0) imageSizeMode = "pixels";
    // K-tier (Seedream): fixed ratio → WxH table; auto → keyword 2K
    else if (hasKResolutions) imageSizeMode = "auto";
    else if (showRatio && showResolution) imageSizeMode = "pixels";
    else if (showResolution) imageSizeMode = "keyword";
    else if (showRatio) imageSizeMode = "pixels";
  }

  return {
    legacyFallback: false,
    showRatio,
    showResolution,
    showSizePicker,
    showDuration: kind === "video",
    aspects,
    resolutions,
    sizes,
    imageSizeMode,
  };
}

/** @deprecated prefer layoutControlsFromCapabilities */
export function aspectsFromCapabilities(
  caps?: ModelCapabilities | null,
  kind: "image" | "video" = "image",
): AspectOption[] {
  return layoutControlsFromCapabilities(caps, kind).aspects;
}

/** @deprecated prefer layoutControlsFromCapabilities */
export function resolutionsFromCapabilities(
  caps?: ModelCapabilities | null,
  kind: "image" | "video" = "image",
): ResolutionOption[] {
  return layoutControlsFromCapabilities(caps, kind).resolutions;
}

export function durationsFromCapabilities(
  caps?: ModelCapabilities | null,
): number[] {
  const max = caps?.maxDurationSec;
  const candidates = [...DEFAULT_VIDEO_DURATIONS];
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    const extras = [max];
    if (max >= 12) extras.push(12);
    if (max >= 15) extras.push(15);
    for (const d of extras) {
      if (!candidates.includes(d as (typeof DEFAULT_VIDEO_DURATIONS)[number])) {
        candidates.push(d);
      }
    }
    return [...new Set(candidates)]
      .filter((d) => d <= max)
      .sort((a, b) => a - b);
  }
  return [...DEFAULT_VIDEO_DURATIONS];
}

export function formatQualityLabel(
  resolution: ResolutionOption,
  kind: "image" | "video",
) {
  if (kind === "image") {
    const up = resolution.label.toUpperCase();
    return up.includes("K") ? up : resolution.label;
  }
  return resolution.label;
}
