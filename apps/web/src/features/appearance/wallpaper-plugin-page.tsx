"use client";

import { useState } from "react";
import { Link2, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { PluginDetailShell } from "@/features/plugins";
import { BUILTIN_WALLPAPERS } from "./builtin-wallpapers";
import {
  useActiveWallpaper,
  useAppearanceStore,
} from "./appearance-store";
import {
  DEFAULT_WALLPAPER_ID,
  customToWallpaperItem,
  detectWallpaperKind,
  type WallpaperItem,
} from "./types";
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
  const customs = useAppearanceStore((s) => s.customWallpapers);
  const selectWallpaper = useAppearanceStore((s) => s.selectWallpaper);
  const setPaused = useAppearanceStore((s) => s.setPaused);
  const addCustomWallpaper = useAppearanceStore((s) => s.addCustomWallpaper);
  const removeCustomWallpaper = useAppearanceStore(
    (s) => s.removeCustomWallpaper,
  );
  const selectedId = wallpaperId ?? DEFAULT_WALLPAPER_ID;

  const [urlDraft, setUrlDraft] = useState("");
  const [kindDraft, setKindDraft] = useState<"auto" | "image" | "video">(
    "auto",
  );

  function onAddUrl() {
    const kind = kindDraft === "auto" ? undefined : kindDraft;
    const res = addCustomWallpaper({ src: urlDraft, kind });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("已添加并应用");
    setUrlDraft("");
    setKindDraft("auto");
  }

  const customItems = customs.map(customToWallpaperItem);

  const actions = (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-[2px] shadow-none"
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
        className="h-8 rounded-[2px] shadow-none"
        disabled={selectedId === DEFAULT_WALLPAPER_ID}
        onClick={() => selectWallpaper(DEFAULT_WALLPAPER_ID)}
      >
        <RotateCcw className="h-3.5 w-3.5" />
        恢复舞台
      </Button>
    </>
  );

  return (
    <PluginDetailShell pluginId="wallpaper" actions={actions}>
      <div className="joy-appearance-panel">
        <section className="joy-appearance-url">
          <div className="joy-appearance-section-title mb-2">添加 URL</div>
          <div className="joy-appearance-url-row">
            <div className="joy-appearance-url-input">
              <Link2 className="joy-appearance-url-icon" aria-hidden />
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="https://… 图片或 .mp4 / .webm 视频"
                className="h-8 rounded-[2px] border-0 bg-transparent pl-8 shadow-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddUrl();
                  }
                }}
              />
            </div>
            <Select
              value={kindDraft}
              onValueChange={(v) =>
                setKindDraft(v as "auto" | "image" | "video")
              }
            >
              <SelectTrigger className="h-8 w-[96px] shrink-0 rounded-[2px] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="shadow-none">
                <SelectItem value="auto">
                  自动
                  {urlDraft.trim()
                    ? ` · ${detectWallpaperKind(urlDraft) === "video" ? "视频" : "图片"}`
                    : ""}
                </SelectItem>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 rounded-[2px] shadow-none"
              disabled={!urlDraft.trim()}
              onClick={onAddUrl}
            >
              <Plus className="h-3.5 w-3.5" />
              添加
            </Button>
          </div>
        </section>

        {customItems.length > 0 ? (
          <div>
            <div className="joy-appearance-section-title mb-2">自定义</div>
            <div className="joy-appearance-grid">
              {customItems.map((w) => (
                <div key={w.id} className="joy-appearance-thumb-wrap">
                  <button
                    type="button"
                    className={cn(
                      "joy-appearance-thumb",
                      selectedId === w.id && "is-active",
                    )}
                    onClick={() => selectWallpaper(w.id)}
                    title={w.src}
                  >
                    <ThemePreview item={w} />
                    <span className="joy-appearance-thumb-live">
                      {w.kind === "video" ? "LIVE" : "STILL"}
                    </span>
                    <span className="joy-appearance-thumb-label">{w.title}</span>
                  </button>
                  <button
                    type="button"
                    className="joy-appearance-thumb-remove"
                    title="删除"
                    aria-label={`删除 ${w.title}`}
                    onClick={() => {
                      removeCustomWallpaper(w.id);
                      toast.success("已删除");
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {GROUPS.map((group) => {
          const items = group.ids
            .map((id) => BUILTIN_WALLPAPERS.find((w) => w.id === id))
            .filter((w): w is WallpaperItem => Boolean(w));
          if (items.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="joy-appearance-section-title mb-2">
                {group.title}
              </div>
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
    </PluginDetailShell>
  );
}

function ThemePreview({ item }: { item: WallpaperItem }) {
  if (item.kind === "image" || item.preview) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={item.preview ?? item.src} alt="" loading="lazy" />
    );
  }
  return <video src={item.src} muted playsInline preload="metadata" />;
}
