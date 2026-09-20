export type WallpaperKind = "image" | "video" | "stage";

export type WallpaperSource = "builtin";

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
