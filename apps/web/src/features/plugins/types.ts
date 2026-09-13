export type PluginStatus = "available" | "coming_soon";

export type PluginManifest = {
  id: string;
  name: string;
  description: string;
  /** Route under /plugins/... */
  href: string;
  tags: string[];
  status: PluginStatus;
  /** Lucide icon name key for the card */
  icon: "wallpaper" | "sparkles" | "palette";
};
