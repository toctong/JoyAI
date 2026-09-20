import type { PluginManifest } from "./types";

/** Client-side plugin catalog. Wallpaper is the first live module. */
export const PLUGIN_REGISTRY: PluginManifest[] = [
  {
    id: "wallpaper",
    name: "灵感主题",
    description:
      "灵感页背景：默认三幕切换，也可换成官方静帧或循环视频。",
    href: "/admin/plugins/wallpaper",
    tags: ["灵感页", "主题", "液态玻璃"],
    status: "available",
    icon: "wallpaper",
  },
];

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
