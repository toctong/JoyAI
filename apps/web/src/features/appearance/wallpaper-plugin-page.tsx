"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { BUILTIN_WALLPAPERS } from "./builtin-wallpapers";
import {
  useActiveWallpaper,
  useAppearanceStore,
} from "./appearance-store";
import { DEFAULT_WALLPAPER_ID, type WallpaperItem } from "./types";
import "./appearance.css";

const GROUPS: { title: string; ids: string[] }[] = [
  {
    title: "舞台",
    ids: ["inspire-stage"],
  },
  {
    title: "其他",
    ids: ["joy-theme-1", "joy-theme-2", "joy-theme-3", "joy-theme-4"],
  },
];

/** Theme picker for the inspire page — /admin/plugins/wallpaper. */
export function WallpaperPluginPage() {
  const active = useActiveWallpaper();
  const wallpaperId = useAppearanceStore((s) => s.wallpaperId);
  const paused = useAppearanceStore((s) => s.paused);
  const selectWallpaper = useAppearanceStore((s) => s.selectWallpaper);
  const setPaused = useAppearanceStore((s) => s.setPaused);
  const selectedId = wallpaperId ?? DEFAULT_WALLPAPER_ID;

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
          disabled={selectedId === DEFAULT_WALLPAPER_ID}
          onClick={() => selectWallpaper(DEFAULT_WALLPAPER_ID)}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          恢复舞台
        </Button>
      </div>

      <p className="joy-appearance-note">
        选中后铺满灵感页。默认是三幕正放 / 倒放切换。
      </p>

      {GROUPS.map((group) => {
        const items = group.ids
          .map((id) => BUILTIN_WALLPAPERS.find((w) => w.id === id))
          .filter((w): w is WallpaperItem => Boolean(w));
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <div className="joy-appearance-section-title mb-2">{group.title}</div>
            <div className="joy-appearance-grid">
              {items.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className={cn(
                    "joy-appearance-thumb",
                    selectedId === w.id && "is-active",
                  )}
                  onClick={() => selectWallpaper(w.id)}
                  title={w.blurb ?? w.title}
                >
                  <ThemePreview item={w} />
                  <span className="joy-appearance-thumb-live">
                    {w.kind === "stage"
                      ? "STAGE"
                      : w.kind === "video"
                        ? "LIVE"
                        : "STILL"}
                  </span>
                  <span className="joy-appearance-thumb-label">{w.title}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ThemePreview({ item }: { item: WallpaperItem }) {
  if (item.preview) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.preview} alt="" loading="lazy" />;
  }
  return <video src={item.src} muted playsInline preload="metadata" />;
}
