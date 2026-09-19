"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import type { ManjuProjectDraft } from "../manju-types";

export function PreviewStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const clips = useMemo(() => {
    const pool = episodeId
      ? project.shots.filter((s) => s.episodeId === episodeId)
      : project.shots;
    return pool.filter((s) => s.videoUrl);
  }, [project.shots, episodeId]);

  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [zipping, setZipping] = useState(false);

  const current = clips[active] ?? null;

  useEffect(() => {
    if (active >= clips.length) setActive(0);
  }, [active, clips.length]);

  const advance = () => {
    setActive((i) => {
      if (i >= clips.length - 1) {
        setAutoPlay(false);
        toast.message("已播完本集镜头");
        return i;
      }
      return i + 1;
    });
  };

  const downloadZip = async () => {
    if (clips.length === 0 || zipping) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const stem = (project.title || "manju").replace(/[\\/:*?"<>|]+/g, "_");
      let added = 0;
      for (const shot of clips) {
        if (!shot.videoUrl) continue;
        const res = await fetch(shot.videoUrl);
        if (!res.ok) {
          toast.message(`镜头 ${String(shot.index).padStart(2, "0")} 下载失败，已跳过`);
          continue;
        }
        const blob = await res.blob();
        const ext =
          blob.type.includes("webm")
            ? "webm"
            : blob.type.includes("quicktime")
              ? "mov"
              : "mp4";
        zip.file(
          `${stem}_${String(shot.index).padStart(2, "0")}.${ext}`,
          blob,
        );
        added += 1;
      }
      if (added === 0) {
        toast.error("没有可打包的视频");
        return;
      }
      const out = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}_clips.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已打包 ${added} 个镜头`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打包失败");
    } finally {
      setZipping(false);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="manju-card max-w-2xl">
        <div className="manju-card__title">视频预览</div>
        <p className="manju-card__desc">
          还没有可预览的镜头视频。请先在「分镜视频」中生成至少一个片段。
        </p>
      </div>
    );
  }

  return (
    <div className="manju-panel">
      <ResizablePanelGroup
        orientation="horizontal"
        className="manju-preview-split min-h-[520px] overflow-hidden rounded-xl border border-border"
      >
        <ResizablePanel defaultSize="72" minSize="48">
          <div className="flex h-full min-h-0 flex-col">
            <div className="manju-preview-stage min-h-0 flex-1 bg-black">
              {current?.videoUrl ? (
                <StudioPlyrPlayer
                  key={`${current.id}-${autoPlay ? "seq" : "manual"}`}
                  src={current.videoUrl}
                  poster={current.storyboardImageUrl}
                  className="max-h-full max-w-full"
                  autoPlay={autoPlay}
                  onEnded={() => {
                    if (autoPlay) advance();
                  }}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
              <div className="text-sm">
                <span className="font-semibold">{project.title}</span>
                <span className="ml-2 text-muted-foreground">
                  {String(current?.index ?? 0).padStart(2, "0")} /{" "}
                  {String(clips.length).padStart(2, "0")}
                  {episodeId ? " · 当前分集" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={autoPlay ? "default" : "outline"}
                  onClick={() => setAutoPlay((v) => !v)}
                >
                  {autoPlay ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {autoPlay ? "停止连播" : "顺序连播"}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={current?.videoUrl ?? undefined}
                    download
                    target="_blank"
                    rel="noreferrer"
                  >
                    下载当前镜
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={zipping}
                  onClick={() => void downloadZip()}
                >
                  {zipping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {zipping ? "打包中…" : "打包下载全部"}
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="28" minSize="18" maxSize="42">
          <div className="manju-preview-list h-full overflow-y-auto p-2">
            {clips.map((shot, i) => (
              <button
                key={shot.id}
                type="button"
                className={cn(
                  "manju-preview-row",
                  i === active && "manju-preview-row--active",
                )}
                onClick={() => {
                  setActive(i);
                  setAutoPlay(false);
                }}
              >
                <span className="manju-preview-row__thumb">
                  {shot.storyboardImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shot.storyboardImageUrl} alt="" />
                  ) : (
                    <span>{String(shot.index).padStart(2, "0")}</span>
                  )}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-xs font-semibold">
                    {String(shot.index).padStart(2, "0")}
                    {shot.videoStale ? " · 需重做" : ""}
                  </span>
                  <span className="line-clamp-2 block text-[11px] text-muted-foreground">
                    {shot.visual || "已有成片"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
