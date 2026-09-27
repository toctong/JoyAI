"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import {
  CanvasIconClose,
  CanvasIconMaximize,
  CanvasIconPause,
  CanvasIconPlay,
  CanvasIconVideo,
} from "../icons/canvas-icons";
import {
  MediaBusyState,
  MediaUploadLabel,
  mediaBusyLabel,
} from "../media-upload-label";
import { isBusyStatus } from "../node-registry";
import { cancelNodeJob } from "../lib/cancel-node-job";
import { setPlaybackTime } from "../lib/playback-clock";
import { cn } from "@/shared/lib/utils";
import { useReleaseMediaOnUnmount } from "@/shared/lib/use-release-media-on-unmount";
import { releaseHtmlMedia } from "@/shared/lib/release-media";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

function readDuration(video: HTMLVideoElement) {
  const next = video.duration;
  return Number.isFinite(next) && next > 0 ? next : 0;
}

export function VideoNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const videoRef = useRef<HTMLVideoElement>(null);
  useReleaseMediaOnUnmount(videoRef);
  const [hovered, setHovered] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [preview, setPreview] = useState(false);
  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");
  const busy = isBusyStatus(status);
  const canCancel =
    busy && Boolean(String(node.data.jobId ?? "").trim());
  const onCancel = canCancel
    ? () => void cancelNodeJob(node.id)
    : undefined;
  const title = nodeTitleLabel("video", node.data);
  const mediaW = Number(node.data.mediaWidth);
  const mediaH = Number(node.data.mediaHeight);
  const sizeMeta =
    Number.isFinite(mediaW) &&
    Number.isFinite(mediaH) &&
    mediaW > 0 &&
    mediaH > 0
      ? `${Math.round(mediaW)} × ${Math.round(mediaH)}`
      : undefined;
  const showControls = framed && (selected || hovered);
  const canSeek = duration > 0;

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setPreview(false);
    return () => releaseHtmlMedia(videoRef.current);
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;

    const syncDuration = () => {
      const next = readDuration(video);
      if (next > 0) setDuration(next);
    };

    syncDuration();
    video.addEventListener("loadedmetadata", syncDuration);
    video.addEventListener("durationchange", syncDuration);
    return () => {
      video.removeEventListener("loadedmetadata", syncDuration);
      video.removeEventListener("durationchange", syncDuration);
    };
  }, [url]);

  useEffect(() => {
    if (!selected) videoRef.current?.pause();
  }, [selected, url]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) {
        const next = video.currentTime;
        setTime(next);
        setPlaybackTime(node.id, next);
        const dur = readDuration(video);
        if (dur > 0) setDuration(dur);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, node.id]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {
        setPlaying(false);
      });
    } else {
      video.pause();
    }
  }

  function openPreview() {
    videoRef.current?.pause();
    setPreview(true);
  }

  function seekToClientX(clientX: number, track: HTMLElement) {
    if (!canSeek) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = duration * ratio;
    const video = videoRef.current;
    if (!video || !Number.isFinite(next)) return;
    video.currentTime = next;
    setTime(next);
    setPlaybackTime(node.id, next);
  }

  const progress = canSeek ? Math.min(Math.max(time / duration, 0), 1) : 0;

  return (
    <div
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-video-controls]")) {
          event.stopPropagation();
          return;
        }
        onPointerDown(event);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        !framed && "overflow-hidden",
        nodeChromeClass({ selected, highlighted, pulsing, framed }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 420,
        height: node.height ?? 236,
      }}
    >
      <NodeTitleChip
        nodeId={node.id}
        label={title}
        customTitle={String(node.data.title ?? "")}
        visible={framed || busy || selected || hovered}
        icon={<CanvasIconVideo />}
        meta={sizeMeta}
        onDragPointerDown={onPointerDown}
      />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-md",
          framed && "bg-black",
        )}
      >
        {url ? (
          <video
            ref={videoRef}
            src={url}
            draggable={false}
            playsInline
            preload="metadata"
            className={cn(
              "pointer-events-none h-full w-full select-none",
              node.data.freeResize ? "object-fill" : "object-contain",
            )}
            onDragStart={(event) => event.preventDefault()}
            onTimeUpdate={(event) => {
              const next = event.currentTarget.currentTime;
              setTime(next);
              setPlaybackTime(node.id, next);
              const dur = readDuration(event.currentTarget);
              if (dur > 0) setDuration(dur);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
          />
        ) : busy ? (
          <MediaBusyState
            label={mediaBusyLabel(node.data)}
            onCancel={onCancel}
          />
        ) : (
          <MediaUploadLabel nodeId={node.id} kind="video">
            <CanvasIconVideo />
          </MediaUploadLabel>
        )}
        {framed && busy ? (
          <MediaBusyState
            overlay
            label={mediaBusyLabel(node.data)}
            onCancel={onCancel}
          />
        ) : null}
        {showControls && canSeek ? (
          <span className="pointer-events-none absolute left-2 top-2 z-20 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
            {formatClock(time)} / {formatClock(duration)}
          </span>
        ) : null}
        {showControls ? (
          <>
            <button
              type="button"
              data-video-controls
              data-canvas-no-zoom
              title={playing ? "暂停" : "播放"}
              aria-label={playing ? "暂停" : "播放"}
              className="absolute bottom-2 left-2 z-20 flex size-7 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/75"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                togglePlayback();
              }}
            >
              {playing ? (
                <CanvasIconPause className="size-3.5" />
              ) : (
                <CanvasIconPlay className="size-3.5" />
              )}
            </button>
            <button
              type="button"
              data-video-controls
              data-canvas-no-zoom
              title="放大预览"
              aria-label="放大预览"
              className="absolute bottom-2 right-2 z-20 flex size-7 items-center justify-center rounded-md bg-black/55 text-white hover:bg-black/75"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                openPreview();
              }}
            >
              <CanvasIconMaximize className="size-3.5" />
            </button>
            <div
              data-video-controls
              data-canvas-no-zoom
              role="slider"
              aria-label="视频进度"
              aria-valuemin={0}
              aria-valuemax={duration || 0}
              aria-valuenow={Math.min(time, duration || 0)}
              className={cn(
                "absolute bottom-2 left-11 right-11 z-20 flex h-7 items-center",
                canSeek ? "cursor-pointer" : "cursor-default opacity-60",
              )}
              style={{ touchAction: "none" }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !canSeek) return;
                event.stopPropagation();
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                seekToClientX(event.clientX, event.currentTarget);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                  return;
                }
                event.stopPropagation();
                seekToClientX(event.clientX, event.currentTarget);
              }}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
            >
              <div className="pointer-events-none relative h-1 w-full rounded-full bg-white/35">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white"
                  style={{ width: `${progress * 100}%` }}
                />
                <div
                  className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-white"
                  style={{ left: `calc(${progress * 100}% - 6px)` }}
                />
              </div>
            </div>
          </>
        ) : null}
        <NodeRuntimeBadge
          status={busy ? "idle" : status}
          error={error}
          busyLabel={mediaBusyLabel(node.data)}
          onRetry={
            status === "failed"
              ? () =>
                  updateNodeData(node.id, {
                    status: "idle",
                    error: "",
                    jobId: "",
                    busyLabel: "",
                  })
              : undefined
          }
        />
      </div>
      {preview
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex flex-col bg-black"
              data-canvas-shortcuts-ignore
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-white">
                <span>视频预览 · Esc 关闭</span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"
                  onClick={() => setPreview(false)}
                >
                  <CanvasIconClose className="size-3.5" />
                  关闭
                </button>
              </div>
              <video
                src={url}
                controls
                autoPlay
                playsInline
                className="min-h-0 flex-1 bg-black object-contain"
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
