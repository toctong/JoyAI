export type WallpaperKind = "image" | "video" | "stage";

export type WallpaperSource = "builtin" | "custom";

/** Three-scene cinematic pack: stills + 1s forward/reverse covers. */
export type StagePack = {
  heroes: readonly string[];
  depths: readonly string[];
  covers: readonly { forward: string; reverse: string }[];
};

export type WallpaperItem = {
  id: string;
  title: string;
  kind: WallpaperKind;
  /** Full-bleed media, or a preview still for stage. */
  src: string;
  preview?: string;
  blurb?: string;
  source: WallpaperSource;
  stage?: StagePack;
};

/** Custom URL themes persisted in local storage. */
export type CustomWallpaper = {
  id: string;
  title: string;
  kind: "image" | "video";
  src: string;
};

/** Default inspire theme when nothing else is selected. */
export const DEFAULT_WALLPAPER_ID = "inspire-stage";

/** Fixed liquid-glass defaults (not user-tunable). */
export const DEFAULT_APPEARANCE_KNOBS = {
  wallpaperBlur: 0,
  scrim: 28,
  border: 35,
  glass: 24,
} as const;

export const APPEARANCE_STORAGE_KEY = "joyai-web-appearance";

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

export function detectWallpaperKind(url: string): "image" | "video" {
  return VIDEO_EXT.test(url.trim()) ? "video" : "image";
}

export function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function customToWallpaperItem(c: CustomWallpaper): WallpaperItem {
  return {
    id: c.id,
    title: c.title,
    kind: c.kind,
    src: c.src,
    preview: c.kind === "image" ? c.src : undefined,
    blurb: c.kind === "video" ? "自定义视频" : "自定义图片",
    source: "custom",
  };
}
