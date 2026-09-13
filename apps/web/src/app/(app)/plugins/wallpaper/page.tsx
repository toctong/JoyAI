"use client";

import { PluginDetailShell } from "@/features/plugins";
import { WallpaperPluginPage } from "@/features/appearance";

export default function WallpaperPluginRoute() {
  return (
    <PluginDetailShell pluginId="wallpaper">
      <WallpaperPluginPage />
    </PluginDetailShell>
  );
}
