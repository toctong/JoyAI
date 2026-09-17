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
  // Prefer `sizes`; also salvage WxH mis-filed under `resolutions`.
  for (const raw of [...(caps?.sizes ?? []), ...(caps?.resolutions ?? [])]) {
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

function isPixelResolutionToken(raw: string): boolean {
  return parseSize(raw) != null;
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

  // Do NOT inject "adaptive" for every video model — DashScope HappyHorse / Wan
  // reject it (only fixed ratios). Seedance catalogs already list adaptive explicitly.
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
  // Drop WxH tokens from resolution chips (they belong in sizes).
  const resolutionIds =
    caps?.resolutions
      ?.map((r) => r.trim())
      .filter((r) => Boolean(r) && !isPixelResolutionToken(r)) ?? [];
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
  const candidates: number[] = [...DEFAULT_VIDEO_DURATIONS];
  if (typeof max === "number" && Number.isFinite(max) && max > 0) {
    const extras = [max];
    if (max >= 12) extras.push(12);
    if (max >= 15) extras.push(15);
    for (const d of extras) {
      if (!candidates.includes(d)) {
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

export type VideoRefModeId = "omni" | "first_last";

export type VideoRefModeOption = {
  id: VideoRefModeId;
  label: string;
  /** Native first_frame/last_frame roles (else prompt fallback via omni refs). */
  nativeFirstLast: boolean;
};

function featureSet(caps?: ModelCapabilities | null): Set<string> {
  return new Set((caps?.features ?? []).map((f) => f.trim().toLowerCase()));
}

export function hasOmniRefCapability(caps?: ModelCapabilities | null): boolean {
  const f = featureSet(caps);
  return f.has("omni-ref") || f.has("r2v");
}

export function hasNativeFirstLastCapability(
  caps?: ModelCapabilities | null,
): boolean {
  return featureSet(caps).has("first-last-frame");
}

/** Modes shown in the video composer chip — driven by catalog features. */
export function refModesFromCapabilities(
  caps?: ModelCapabilities | null,
): VideoRefModeOption[] {
  const omni = hasOmniRefCapability(caps);
  const nativeFL = hasNativeFirstLastCapability(caps);
  const modes: VideoRefModeOption[] = [];
  if (omni) {
    modes.push({ id: "omni", label: "全能参考", nativeFirstLast: false });
  }
  if (nativeFL || omni) {
    modes.push({
      id: "first_last",
      label: "首尾帧参考",
      nativeFirstLast: nativeFL,
    });
  }
  return modes;
}

/** Whether the composer should show the reference upload slot. */
export function showReferenceUpload(
  caps?: ModelCapabilities | null,
  kind: "image" | "video" = "image",
): boolean {
  if (!caps) return true;
  if (typeof caps.maxRefImages === "number") {
    if (caps.maxRefImages > 0) return true;
  } else {
    const input = caps.input ?? [];
    if (input.includes("image")) return true;
  }
  if (kind === "video") {
    if (typeof caps.maxRefVideos === "number" && caps.maxRefVideos > 0) {
      return true;
    }
    if (typeof caps.maxRefAudios === "number" && caps.maxRefAudios > 0) {
      return true;
    }
    if ((caps.input ?? []).includes("video")) return true;
    if ((caps.input ?? []).includes("audio")) return true;
    if (hasOmniRefCapability(caps) || hasNativeFirstLastCapability(caps)) {
      return true;
    }
    if (featureSet(caps).has("i2v")) return true;
  }
  if (typeof caps.maxRefImages === "number" && caps.maxRefImages <= 0) {
    return false;
  }
  return false;
}

export type RefMediaKind = "image" | "video" | "audio";

export type RefSlotLimits = {
  images: number | null;
  videos: number | null;
  audios: number | null;
  minVideoSec: number | null;
  maxVideoSec: number | null;
  minAudioSec: number | null;
  maxAudioSec: number | null;
  minImageSidePx: number | null;
  maxImageSidePx: number | null;
  maxImagePixels: number | null;
  minImageAspect: number | null;
  maxImageAspect: number | null;
  maxImageBytes: number | null;
  maxVideoBytes: number | null;
  maxAudioBytes: number | null;
};

const emptyMediaLimits = {
  minVideoSec: null as number | null,
  maxVideoSec: null as number | null,
  minAudioSec: null as number | null,
  maxAudioSec: null as number | null,
  minImageSidePx: null as number | null,
  maxImageSidePx: null as number | null,
  maxImagePixels: null as number | null,
  minImageAspect: null as number | null,
  maxImageAspect: null as number | null,
  maxImageBytes: null as number | null,
  maxVideoBytes: null as number | null,
  maxAudioBytes: null as number | null,
};

function mediaLimitsFromCaps(
  caps: ModelCapabilities | null | undefined,
  opts: { allowImage: boolean; allowVideo: boolean; allowAudio: boolean },
): Omit<
  RefSlotLimits,
  "images" | "videos" | "audios"
> {
  return {
    minVideoSec: opts.allowVideo
      ? (caps?.minRefVideoDurationSec ?? 2)
      : null,
    maxVideoSec: opts.allowVideo
      ? (caps?.maxRefVideoDurationSec ?? 15)
      : null,
    minAudioSec: opts.allowAudio
      ? (caps?.minRefAudioDurationSec ?? null)
      : null,
    maxAudioSec: opts.allowAudio
      ? (caps?.maxRefAudioDurationSec ?? 15)
      : null,
    minImageSidePx: opts.allowImage
      ? (caps?.minRefImageSidePx ?? null)
      : null,
    maxImageSidePx: opts.allowImage
      ? (caps?.maxRefImageSidePx ?? null)
      : null,
    maxImagePixels: opts.allowImage
      ? (caps?.maxRefImagePixels ?? null)
      : null,
    minImageAspect: opts.allowImage
      ? (caps?.minRefImageAspect ?? null)
      : null,
    maxImageAspect: opts.allowImage
      ? (caps?.maxRefImageAspect ?? null)
      : null,
    maxImageBytes: opts.allowImage
      ? (caps?.maxRefImageBytes ?? null)
      : null,
    maxVideoBytes: opts.allowVideo
      ? (caps?.maxRefVideoBytes ?? null)
      : null,
    maxAudioBytes: opts.allowAudio
      ? (caps?.maxRefAudioBytes ?? null)
      : null,
  };
}

/** Per-modality ref limits from catalog (first_last → images only, max 2). */
export function refSlotLimitsFromCapabilities(
  caps?: ModelCapabilities | null,
  opts?: { kind?: "image" | "video"; refMode?: string },
): RefSlotLimits {
  const kind = opts?.kind ?? "image";
  const firstLast = kind === "video" && opts?.refMode === "first_last";
  if (firstLast) {
    return {
      images: 2,
      videos: 0,
      audios: 0,
      ...mediaLimitsFromCaps(caps, {
        allowImage: true,
        allowVideo: false,
        allowAudio: false,
      }),
    };
  }
  if (!caps) {
    return {
      images: null,
      videos: kind === "video" ? null : 0,
      audios: kind === "video" ? null : 0,
      ...emptyMediaLimits,
      ...(kind === "video"
        ? { minVideoSec: 2, maxVideoSec: 15, maxAudioSec: 15 }
        : {}),
    };
  }

  let images: number | null = 0;
  if (typeof caps.maxRefImages === "number") {
    images = Math.max(0, caps.maxRefImages);
  } else if ((caps.input ?? []).includes("image")) {
    images = null;
  }

  let videos: number | null = 0;
  let audios: number | null = 0;
  if (kind === "video") {
    if (typeof caps.maxRefVideos === "number") {
      videos = Math.max(0, caps.maxRefVideos);
    } else if (
      (caps.input ?? []).includes("video") ||
      featureSet(caps).has("ref-video") ||
      hasOmniRefCapability(caps)
    ) {
      videos = null;
    }
    if (typeof caps.maxRefAudios === "number") {
      audios = Math.max(0, caps.maxRefAudios);
    } else if (
      (caps.input ?? []).includes("audio") ||
      featureSet(caps).has("audio") ||
      hasOmniRefCapability(caps)
    ) {
      audios = null;
    }
  }

  const allowImage = images == null || images > 0;
  const allowVideo = videos == null || videos > 0;
  const allowAudio = audios == null || audios > 0;
  return {
    images,
    videos,
    audios,
    ...mediaLimitsFromCaps(caps, { allowImage, allowVideo, allowAudio }),
  };
}

export function classifyRefFile(file: File): RefMediaKind | null {
  const t = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (t.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(name)) {
    return "image";
  }
  if (
    t.startsWith("video/") ||
    /\.(mp4|webm|mov|m4v)$/i.test(name)
  ) {
    return "video";
  }
  if (
    t.startsWith("audio/") ||
    /\.(mp3|wav|aac|m4a|ogg|flac)$/i.test(name)
  ) {
    return "audio";
  }
  return null;
}

/** Dropzone accept map driven by remaining capability. */
export function refDropAccept(
  limits: RefSlotLimits,
): Record<string, string[]> | undefined {
  const accept: Record<string, string[]> = {};
  if (limits.images == null || limits.images > 0) {
    accept["image/*"] = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
  }
  if (limits.videos == null || limits.videos > 0) {
    accept["video/*"] = [".mp4", ".mov", ".webm", ".m4v"];
  }
  if (limits.audios == null || limits.audios > 0) {
    accept["audio/*"] = [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac"];
  }
  return Object.keys(accept).length ? accept : undefined;
}

export function probeMediaDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const kind = classifyRefFile(file);
    const el = document.createElement(
      kind === "audio" ? "audio" : "video",
    ) as HTMLMediaElement;
    el.preload = "metadata";
    const cleanup = () => {
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error("无法读取媒体时长"));
        return;
      }
      resolve(d);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error("无法读取媒体文件"));
    };
    el.src = url;
  });
}

export function probeImageSize(
  file: File,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      URL.revokeObjectURL(url);
      if (!width || !height) {
        reject(new Error("无法读取图片尺寸"));
        return;
      }
      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片文件"));
    };
    img.src = url;
  });
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) {
    const mb = n / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)}MB`;
  }
  if (n >= 1024) return `${Math.round(n / 1024)}KB`;
  return `${n}B`;
}

/** Validate image dimensions / bytes against catalog limits. */
export function validateRefImageConstraints(
  file: File,
  size: { width: number; height: number },
  limits: RefSlotLimits,
): string | null {
  if (limits.maxImageBytes != null && file.size > limits.maxImageBytes) {
    return `参考图不能超过 ${formatBytes(limits.maxImageBytes)}（${file.name} 约 ${formatBytes(file.size)}）`;
  }
  const { width, height } = size;
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  if (limits.minImageSidePx != null && minSide < limits.minImageSidePx) {
    return `参考图最短边需 ≥ ${limits.minImageSidePx}px（当前 ${width}×${height}）`;
  }
  if (limits.maxImageSidePx != null && maxSide > limits.maxImageSidePx) {
    return `参考图最长边需 ≤ ${limits.maxImageSidePx}px（当前 ${width}×${height}）`;
  }
  if (
    limits.maxImagePixels != null &&
    width * height > limits.maxImagePixels
  ) {
    return `参考图总像素需 ≤ ${limits.maxImagePixels.toLocaleString()}（当前 ${width}×${height}）`;
  }
  const aspect = width / height;
  if (limits.minImageAspect != null && aspect < limits.minImageAspect - 1e-6) {
    return `参考图宽高比需 ≥ ${limits.minImageAspect}（当前 ${aspect.toFixed(2)}）`;
  }
  if (limits.maxImageAspect != null && aspect > limits.maxImageAspect + 1e-6) {
    return `参考图宽高比需 ≤ ${limits.maxImageAspect}（当前 ${aspect.toFixed(2)}）`;
  }
  return null;
}

export function validateRefFileBytes(
  file: File,
  mediaKind: RefMediaKind,
  limits: RefSlotLimits,
): string | null {
  if (
    mediaKind === "video" &&
    limits.maxVideoBytes != null &&
    file.size > limits.maxVideoBytes
  ) {
    return `参考视频不能超过 ${formatBytes(limits.maxVideoBytes)}（${file.name} 约 ${formatBytes(file.size)}）`;
  }
  if (
    mediaKind === "audio" &&
    limits.maxAudioBytes != null &&
    file.size > limits.maxAudioBytes
  ) {
    return `参考音频不能超过 ${formatBytes(limits.maxAudioBytes)}（${file.name} 约 ${formatBytes(file.size)}）`;
  }
  return null;
}
