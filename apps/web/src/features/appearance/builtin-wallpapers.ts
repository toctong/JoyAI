import type { WallpaperItem } from "./types";

/** Official JoyAI TOS built-in themes (2 stills + 2 live videos). */
export const BUILTIN_WALLPAPERS: WallpaperItem[] = [
  {
    id: "joy-theme-1",
    title: "主题 1",
    kind: "image",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/1.jpg",
    preview: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/1.jpg",
    source: "builtin",
  },
  {
    id: "joy-theme-2",
    title: "主题 2",
    kind: "image",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/2.jpg",
    preview: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/2.jpg",
    source: "builtin",
  },
  {
    id: "joy-theme-3",
    title: "主题 3",
    kind: "video",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/3.mp4",
    source: "builtin",
  },
  {
    id: "joy-theme-4",
    title: "主题 4",
    kind: "video",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/4.mp4",
    source: "builtin",
  },
];
