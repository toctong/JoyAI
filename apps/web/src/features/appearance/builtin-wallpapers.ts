import { INSPIRE_MEDIA } from "@/features/inspire/inspire-media";
import type { WallpaperItem } from "./types";

/** Inspire themes. Default is the cinematic three-scene stage. */
export const BUILTIN_WALLPAPERS: WallpaperItem[] = [
  {
    id: "inspire-stage",
    title: "三幕切换",
    kind: "stage",
    src: INSPIRE_MEDIA.heroes[0],
    preview: INSPIRE_MEDIA.heroes[0],
    blurb: "1 秒正放 / 倒放",
    source: "builtin",
    stage: INSPIRE_MEDIA,
  },
  {
    id: "joy-theme-1",
    title: "静帧 1",
    kind: "image",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/1.jpg",
    preview: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/1.jpg",
    source: "builtin",
  },
  {
    id: "joy-theme-2",
    title: "静帧 2",
    kind: "image",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/2.jpg",
    preview: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/2.jpg",
    source: "builtin",
  },
  {
    id: "joy-theme-3",
    title: "动态 1",
    kind: "video",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/3.mp4",
    blurb: "循环视频",
    source: "builtin",
  },
  {
    id: "joy-theme-4",
    title: "动态 2",
    kind: "video",
    src: "https://aigc-joyai.tos-cn-beijing.volces.com/bg_theme/4.mp4",
    blurb: "循环视频",
    source: "builtin",
  },
];
