import type { PluginManifest } from "./types";

/** Client-side plugin catalog. Wallpaper is the first live module. */
export const PLUGIN_REGISTRY: PluginManifest[] = [
  {
    id: "wallpaper",
    name: "外观与壁纸",
    description:
      "专为灵感页准备：使用官方 TOS 主题（静图 / 动态视频），侧栏透出背景，输入框启用液态玻璃。",
    href: "/admin/plugins/wallpaper",
    tags: ["灵感页", "主题", "液态玻璃"],
    status: "available",
    icon: "wallpaper",
  },
];

export function getPlugin(id: string): PluginManifest | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
