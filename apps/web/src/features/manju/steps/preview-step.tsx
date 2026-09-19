"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  const downloadAll = async () => {
    if (clips.length === 0) return;
    toast.message(`开始下载 ${clips.length} 个镜头…`);
    for (const shot of clips) {
      if (!shot.videoUrl) continue;
      const a = document.createElement("a");
      a.href = shot.videoUrl;
      a.download = `${project.title || "manju"}_${String(shot.index).padStart(2, "0")}.mp4`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
      await new Promise((r) => setTimeout(r, 400));
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
    <div className="manju-panel max-w-4xl">
      <div className="manju-card !overflow-hidden !p-0">
        <div className="manju-preview-stage bg-black">
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
            <Button variant="outline" size="sm" onClick={() => void downloadAll()}>
              <Download className="h-4 w-4" />
              打包下载全部
            </Button>
          </div>
        </div>
      </div>

      <div className="manju-preview-strip">
        {clips.map((shot, i) => (
          <button
            key={shot.id}
            type="button"
            className={cn(
              "manju-preview-thumb",
              i === active && "manju-preview-thumb--active",
            )}
            onClick={() => {
              setActive(i);
              setAutoPlay(false);
            }}
          >
            {shot.storyboardImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.storyboardImageUrl} alt="" />
            ) : (
              <span>{String(shot.index).padStart(2, "0")}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
