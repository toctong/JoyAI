"use client";

import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/shared/lib/utils";
import { BUILTIN_WALLPAPERS } from "./builtin-wallpapers";
import {
  useActiveWallpaper,
  useAppearanceStore,
} from "./appearance-store";
import "./appearance.css";

/** Wallpaper plugin module UI — used under /admin/plugins/wallpaper. */
export function WallpaperPluginPage() {
  const active = useActiveWallpaper();
  const wallpaperId = useAppearanceStore((s) => s.wallpaperId);
  const paused = useAppearanceStore((s) => s.paused);
  const selectWallpaper = useAppearanceStore((s) => s.selectWallpaper);
  const clearWallpaper = useAppearanceStore((s) => s.clearWallpaper);
  const setPaused = useAppearanceStore((s) => s.setPaused);

  return (
    <div className="joy-appearance-panel">
      <div className="joy-appearance-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!active || active.kind !== "video"}
          onClick={() => setPaused(!paused)}
        >
          {paused ? (
            <>
              <Play className="h-3.5 w-3.5" />
              播放
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" />
              暂停
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!wallpaperId}
          onClick={() => clearWallpaper()}
        >
          <X className="h-3.5 w-3.5" />
          关闭壁纸
        </Button>
      </div>

      <Separator />

      <div>
        <div className="joy-appearance-section-title mb-2">内置主题</div>
        <div className="joy-appearance-grid">
          {BUILTIN_WALLPAPERS.map((w) => (
            <button
              key={w.id}
              type="button"
              className={cn(
                "joy-appearance-thumb",
                wallpaperId === w.id && "is-active",
              )}
              onClick={() => selectWallpaper(w.id)}
              title={w.title}
            >
              {w.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.preview} alt="" loading="lazy" />
              ) : (
                <video src={w.src} muted playsInline preload="metadata" />
              )}
              {w.kind === "video" ? (
                <span className="joy-appearance-thumb-live">LIVE</span>
              ) : null}
              <span className="joy-appearance-thumb-label">{w.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
