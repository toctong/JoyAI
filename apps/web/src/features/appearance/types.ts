export type WallpaperKind = "image" | "video";

export type WallpaperSource = "builtin";

export type WallpaperItem = {
  id: string;
  title: string;
  kind: WallpaperKind;
  src: string;
  preview?: string;
  source: WallpaperSource;
};

/** Fixed liquid-glass defaults (not user-tunable). */
export const DEFAULT_APPEARANCE_KNOBS = {
  wallpaperBlur: 0,
  scrim: 28,
  border: 35,
  glass: 24,
} as const;

export const APPEARANCE_STORAGE_KEY = "joyai-web-appearance";
