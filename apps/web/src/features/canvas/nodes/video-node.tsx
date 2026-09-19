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
  CanvasIconLoader,
  CanvasIconMaximize,
  CanvasIconPause,
  CanvasIconPlay,
  CanvasIconVideo,
} from "../icons/canvas-icons";
import { MediaUploadLabel } from "../media-upload-label";
import { isBusyStatus } from "../node-registry";
import { setPlaybackTime } from "../lib/playback-clock";
import { cn } from "@/shared/lib/utils";

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

export function VideoNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setPreview(false);
  }, [url]);

  useEffect(() => {
    if (!selected) videoRef.current?.pause();
  }, [selected, url]);

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
    if (video.paused) void video.play();
    else video.pause();
  }

  function openPreview() {
    videoRef.current?.pause();
    setPreview(true);
  }

  return (
    <div
      onPointerDown={onPointerDown}
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
            className={cn(
              "pointer-events-none h-full w-full select-none",
              node.data.freeResize ? "object-fill" : "object-contain",
            )}
            onDragStart={(event) => event.preventDefault()}
            onLoadedMetadata={(event) => {
              const next = event.currentTarget.duration;
              setDuration(Number.isFinite(next) ? next : 0);
            }}
            onTimeUpdate={(event) => {
              const next = event.currentTarget.currentTime;
              setTime(next);
              setPlaybackTime(node.id, next);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        ) : busy ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40 text-sm text-muted-foreground">
            <CanvasIconLoader className="size-5 animate-spin opacity-80" />
            <span>分离中…</span>
          </div>
        ) : (
          <MediaUploadLabel nodeId={node.id} kind="video">
            <CanvasIconVideo className="size-7 opacity-70" />
          </MediaUploadLabel>
        )}
        {showControls && duration > 0 ? (
          <span className="pointer-events-none absolute left-2 top-2 z-20 rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
            {formatClock(duration)}
          </span>
        ) : null}
        {showControls ? (
          <>
            <button
              type="button"
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
              className="absolute bottom-2 left-11 right-11 z-20 flex h-7 items-center"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(time, duration || 0)}
                disabled={duration <= 0}
                aria-label="视频进度"
                className="pointer-events-auto block h-1 w-full cursor-pointer appearance-none rounded-full [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                style={{
                  background: `linear-gradient(to right, #fff ${duration > 0 ? Math.min(time / duration, 1) * 100 : 0}%, rgba(255,255,255,0.35) 0)`,
                }}
                onChange={(event) => {
                  const next = event.currentTarget.valueAsNumber;
                  if (!videoRef.current || !Number.isFinite(next)) return;
                  videoRef.current.currentTime = next;
                  setTime(next);
                  setPlaybackTime(node.id, next);
                }}
              />
            </div>
          </>
        ) : null}
        <NodeRuntimeBadge
          status={busy && !framed ? "idle" : status}
          error={error}
          busyLabel="分离中…"
          onRetry={
            status === "failed"
              ? () =>
                  updateNodeData(node.id, {
                    status: "idle",
                    error: "",
                    jobId: "",
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
