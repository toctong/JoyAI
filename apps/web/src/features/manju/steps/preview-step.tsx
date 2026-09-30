"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Film, LayoutDashboard, Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import { fetchRemoteVideoBlob } from "@/features/canvas/lib/load-canvas-video";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { toast } from "@/shared/lib/toast";
import type { ManjuProjectDraft } from "../manju-types";
import { stitchManjuClips } from "../lib/stitch-clips";
import {
  buildManjuCanvasSnapshot,
  shotsForCanvasPush,
} from "../lib/push-to-canvas";

export function PreviewStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const router = useRouter();
  const clips = useMemo(() => {
    const pool = episodeId
      ? project.shots.filter((s) => s.episodeId === episodeId)
      : project.shots;
    return pool
      .filter((s) => s.videoUrl)
      .slice()
      .sort((a, b) => {
        const ea = project.episodes.findIndex((e) => e.id === a.episodeId);
        const eb = project.episodes.findIndex((e) => e.id === b.episodeId);
        if (ea !== eb) return ea - eb;
        return a.index - b.index;
      });
  }, [project.shots, project.episodes, episodeId]);

  const clipLabels = useMemo(() => {
    const epLocal = new Map<string, number>();
    return clips.map((shot) => {
      const epIdx = Math.max(
        1,
        project.episodes.findIndex((e) => e.id === shot.episodeId) + 1,
      );
      const key = shot.episodeId || "_";
      const local = (epLocal.get(key) ?? 0) + 1;
      epLocal.set(key, local);
      return `${epIdx}-${local}`;
    });
  }, [clips, project.episodes]);

  const canvasShots = useMemo(
    () => shotsForCanvasPush(project, episodeId),
    [project, episodeId],
  );

  const [active, setActive] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [stitching, setStitching] = useState(false);
  const [stitchLabel, setStitchLabel] = useState("");
  const [pushing, setPushing] = useState(false);

  const current = clips[active] ?? null;
  const busy = zipping || stitching || pushing;

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

  const stem = (project.title || "manju").replace(/[\\/:*?"<>|]+/g, "_");

  const downloadZip = async () => {
    if (clips.length === 0 || busy) return;
    setZipping(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      let added = 0;
      for (const shot of clips) {
        if (!shot.videoUrl) continue;
        try {
          const blob = /^https?:/i.test(shot.videoUrl)
            ? await fetchRemoteVideoBlob(shot.videoUrl)
            : await fetch(shot.videoUrl).then(async (res) => {
                if (!res.ok) throw new Error("download failed");
                return res.blob();
              });
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
        } catch {
          toast.message(
            `镜头 ${String(shot.index).padStart(2, "0")} 下载失败，已跳过`,
          );
        }
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
      toast.success(`已打包 ${added} 个镜头（ZIP，非成片）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打包失败");
    } finally {
      setZipping(false);
    }
  };

  const exportFilm = async () => {
    if (clips.length === 0 || busy) return;
    if (clips.length < 2) {
      toast.message("至少两个镜头才能拼接成片；单镜请用「下载当前镜」");
      return;
    }
    setStitching(true);
    setStitchLabel("拉取镜头…");
    try {
      const urls = clips.map((c) => c.videoUrl!).filter(Boolean);
      const blob = await stitchManjuClips(urls, {
        onProgress: ({ clipIndex, clipTotal, phase }) => {
          setStitchLabel(
            phase === "fetch"
              ? `拉取 ${clipIndex}/${clipTotal}`
              : `编码 ${clipIndex}/${clipTotal}`,
          );
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${stem}_film.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`成片已导出（${clips.length} 镜拼接）`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "成片拼接失败");
    } finally {
      setStitching(false);
      setStitchLabel("");
    }
  };

  const pushToCanvas = async () => {
    if (busy) return;
    if (canvasShots.length === 0) {
      toast.message("没有可推送的分镜图或镜头视频");
      return;
    }
    setPushing(true);
    try {
      const snapshot = buildManjuCanvasSnapshot(canvasShots);
      const created = await api<{ id: string }>("/canvas/projects", {
        method: "POST",
        body: {
          title: `${project.title || "漫剧"} · 分镜`,
          snapshot,
        },
      });
      toast.success("已推送到新画布（单向，不回写漫剧）");
      router.push(`/canvas/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "推送画布失败");
    } finally {
      setPushing(false);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="manju-card max-w-2xl space-y-4">
        <div>
          <div className="manju-card__title">视频预览</div>
          <p className="text-sm text-muted-foreground">暂无可预览视频</p>
        </div>
        {canvasShots.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pushing}
            onClick={() => void pushToCanvas()}
            title="仅推送已有分镜图到新画布"
          >
            {pushing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LayoutDashboard className="h-4 w-4" />
            )}
            {pushing ? "推送中…" : "推送分镜到画布"}
          </Button>
        ) : null}
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
                <span>{project.title}</span>
                <span className="ml-2 text-muted-foreground">
                  {clipLabels[active] ?? String(current?.index ?? 0).padStart(2, "0")}{" "}
                  / {String(clips.length).padStart(2, "0")}
                  {episodeId
                    ? " · 当前分集"
                    : " · 全部已出片"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={autoPlay ? "default" : "outline"}
                  disabled={busy}
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
                  disabled={busy}
                  onClick={() => void downloadZip()}
                  title="各镜头分开打包，方便后期剪辑"
                >
                  {zipping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {zipping ? "打包中…" : "打包 ZIP"}
                </Button>
                <Button
                  size="sm"
                  disabled={busy || clips.length < 2}
                  onClick={() => void exportFilm()}
                  title="浏览器内拼接为一条 MP4（需 Chromium 系浏览器）"
                >
                  {stitching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Film className="h-4 w-4" />
                  )}
                  {stitching ? stitchLabel || "拼接中…" : "导出成片"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || canvasShots.length === 0}
                  onClick={() => void pushToCanvas()}
                  title="创建新画布并铺开分镜图/视频（不回写漫剧草稿）"
                >
                  {pushing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LayoutDashboard className="h-4 w-4" />
                  )}
                  {pushing ? "推送中…" : "推送到画布"}
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
                    <JoyAssetThumb
                      url={shot.storyboardImageUrl}
                      size="sm"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{clipLabels[i]}</span>
                  )}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-xs">
                    {clipLabels[i]}
                    {shot.videoStale ? " · 需重做" : ""}
                  </span>
                  <span className="line-clamp-2 block text-[11px] text-muted-foreground">
                    {shot.visual || "已有镜头视频"}
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
