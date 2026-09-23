import type { PluginManifest } from "./types";

/** Client-side plugin catalog. Wallpaper is the first live module. */
export const PLUGIN_REGISTRY: PluginManifest[] = [
  {
    id: "wallpaper",
    name: "灵感主题",
    description: "灵感页背景主题：三幕舞台、官方静帧 / 视频，或自定义 URL。",
    href: "/admin/plugins/wallpaper",
    tags: ["灵感页", "主题", "液态玻璃"],
    status: "available",
    icon: "wallpaper",
  },
];

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
