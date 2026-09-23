/**
 * Canonical option dictionaries for ModelCapabilities fields used in admin UX
 * and shared normalize helpers (resolutions / ratios / sizes).
 */

export type CapabilityOption = { value: string; label: string };

/** Video / image resolution tiers seen across JoyAI catalogs (canonical casing). */
export const RESOLUTION_OPTIONS: readonly CapabilityOption[] = [
  { value: "360p", label: "360p" },
  { value: "480p", label: "480p" },
  { value: "512p", label: "512p" },
  { value: "540p", label: "540p" },
  { value: "720p", label: "720p" },
  { value: "768p", label: "768p" },
  { value: "1024p", label: "1024p" },
  { value: "1080p", label: "1080p" },
  { value: "1K", label: "1K" },
  { value: "1.5K", label: "1.5K" },
  { value: "2K", label: "2K" },
  { value: "3K", label: "3K" },
  { value: "4K", label: "4K" },
  { value: "1MP", label: "1MP" },
  { value: "2MP", label: "2MP" },
] as const;

export const RATIO_OPTIONS: readonly CapabilityOption[] = [
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "3:2", label: "3:2" },
  { value: "2:3", label: "2:3" },
  { value: "4:5", label: "4:5" },
  { value: "5:4", label: "5:4" },
  { value: "21:9", label: "21:9" },
  { value: "9:21", label: "9:21" },
  { value: "2:1", label: "2:1" },
  { value: "1:2", label: "1:2" },
  { value: "3:1", label: "3:1" },
  { value: "1:3", label: "1:3" },
  { value: "auto", label: "auto" },
  { value: "adaptive", label: "adaptive" },
] as const;

/** Exact pixel sizes from catalogs + common squares. */
export const SIZE_OPTIONS: readonly CapabilityOption[] = [
  { value: "1024x1024", label: "1024×1024" },
  { value: "1280x720", label: "1280×720" },
  { value: "720x1280", label: "720×1280" },
  { value: "1328x1328", label: "1328×1328" },
  { value: "1104x1472", label: "1104×1472" },
  { value: "1472x1104", label: "1472×1104" },
  { value: "1664x928", label: "1664×928" },
  { value: "928x1664", label: "928×1664" },
] as const;

/** Presets for maxRefImages / maxRefVideos / maxRefAudios. */
export const MAX_REF_PRESETS: readonly number[] = [
  0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 14, 15, 16, 30,
] as const;

/** Presets for maxDurationSec. */
export const DURATION_PRESETS: readonly number[] = [
  5, 6, 8, 10, 12, 15, 20, 25, 30, 60,
] as const;

const RESOLUTION_ALIAS: Record<string, string> = {
  "360p": "360p",
  "480p": "480p",
  "480P": "480p",
  "512p": "512p",
  "540p": "540p",
  "720p": "720p",
  "720P": "720p",
  "768p": "768p",
  "768P": "768p",
  "1024p": "1024p",
  "1080p": "1080p",
  "1080P": "1080p",
  hd: "720p",
  HD: "720p",
  fhd: "1080p",
  FHD: "1080p",
  "1k": "1K",
  "1K": "1K",
  "1.5k": "1.5K",
  "1.5K": "1.5K",
  "2k": "2K",
  "2K": "2K",
  "3k": "3K",
  "3K": "3K",
  "4k": "4K",
  "4K": "4K",
  "1mp": "1MP",
  "1MP": "1MP",
  "2mp": "2MP",
  "2MP": "2MP",
};

const KNOWN_RESOLUTIONS = new Set(RESOLUTION_OPTIONS.map((o) => o.value));
const KNOWN_RATIOS = new Set(RATIO_OPTIONS.map((o) => o.value));
const KNOWN_SIZES = new Set(SIZE_OPTIONS.map((o) => o.value));

/** Map aliases / casing to canonical resolution string; unknown trimmed as-is. */
export function normalizeResolution(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (RESOLUTION_ALIAS[s]) return RESOLUTION_ALIAS[s];
  const lower = s.toLowerCase();
  if (RESOLUTION_ALIAS[lower]) return RESOLUTION_ALIAS[lower];
  // 1080p-style: digits + optional p
  const pMatch = /^(\d+)p$/i.exec(s);
  if (pMatch) {
    const canon = `${pMatch[1]}p`;
    return KNOWN_RESOLUTIONS.has(canon) ? canon : canon;
  }
  return s;
}

export function normalizeResolutions(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = normalizeResolution(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function normalizeRatio(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const lower = s.toLowerCase();
  if (lower === "auto" || lower === "adaptive") return lower;
  // keep W:H digits
  const m = /^(\d+)\s*:\s*(\d+)$/.exec(s);
  if (m) return `${m[1]}:${m[2]}`;
  return s;
}

export function normalizeRatios(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = normalizeRatio(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Normalize `1024X1024` → `1024x1024`. */
export function normalizeSize(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const m = /^(\d+)\s*[x×X]\s*(\d+)$/.exec(s);
  if (m) return `${m[1]}x${m[2]}`;
  return s;
}

export function normalizeSizes(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = normalizeSize(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

export function isKnownResolution(value: string) {
  return KNOWN_RESOLUTIONS.has(normalizeResolution(value));
}

export function isKnownRatio(value: string) {
  return KNOWN_RATIOS.has(normalizeRatio(value));
}

export function isKnownSize(value: string) {
  return KNOWN_SIZES.has(normalizeSize(value));
}
