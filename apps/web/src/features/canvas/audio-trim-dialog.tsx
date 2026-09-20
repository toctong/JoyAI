"use client";

import {
  CanvasIconPause,
  CanvasIconPlay,
} from "./icons/canvas-icons";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetchBlob } from "@/shared/lib/api";
import { fetchRemoteVideoBlob } from "./lib/load-canvas-video";
import { VideoTrim } from "react-video-trim";
import "react-video-trim/style.css";
import "./canvas-chrome.css";

type Props = {
  url: string;
  open: boolean;
  busy?: boolean;
  /** Video nodes clip to a new video node; audio nodes clip audio only. */
  mode?: "video" | "audio";
  onClose: () => void;
  onConfirm: (range: { start: number; end: number }) => void;
};

const MIN_SPAN = 0.5;

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const cs = Math.floor((seconds - total) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

async function loadAudioBlob(url: string) {
  if (/^https?:/i.test(url)) {
    return apiFetchBlob("/media/fetch", {
      params: { url, kind: "audio" },
      timeoutMs: 120_000,
    });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("无法加载音频");
  return res.blob();
}

async function decodePeaks(blob: Blob, bars = 96) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const data = decoded.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / bars));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i += 1) {
      let max = 0;
      const from = i * block;
      for (let j = 0; j < block; j += 24) {
        max = Math.max(max, Math.abs(data[from + j] ?? 0));
      }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.01);
    return peaks.map((value) => value / top);
  } finally {
    await context.close();
  }
}

export function AudioTrimDialog({
  url,
  open,
  busy = false,
  mode = "audio",
  onClose,
  onConfirm,
}: Props) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const asVideo = mode === "video";
  const [src, setSrc] = useState("");
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!open || !url) {
      mediaRef.current?.pause();
      setSrc("");
      setVideoBlob(null);
      setPeaks(null);
      setLoadError("");
      return;
    }

    let cancelled = false;
    let objectUrl = "";
    setDuration(0);
    setStart(0);
    setEnd(0);
    setPlaying(false);
    setLoadError("");
    setSrc("");
    setVideoBlob(null);
    setPeaks(null);

    async function load() {
      try {
        if (asVideo) {
          const blob = /^https?:/i.test(url)
            ? await fetchRemoteVideoBlob(url)
            : await fetch(url).then((res) => {
                if (!res.ok) throw new Error("无法加载视频");
                return res.blob();
              });
          if (!cancelled) setVideoBlob(blob);
          return;
        }
        const blob = await loadAudioBlob(url);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        void decodePeaks(blob)
          .then((next) => {
            if (!cancelled) setPeaks(next);
          })
          .catch(() => {
            if (!cancelled) setPeaks([]);
          });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "无法加载媒体",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asVideo, open, url]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    const onTime = () => {
      if (media.currentTime >= end) {
        media.pause();
        media.currentTime = start;
        setPlaying(false);
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("pause", onPause);
    media.addEventListener("play", onPlay);
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("play", onPlay);
    };
  }, [end, src, start]);

  function applyDuration(next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    setDuration(next);
    setStart(0);
    setEnd(next);
  }

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas || !peaks?.length) return;
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (peaks.length - 1)) / peaks.length);
      const fg =
        getComputedStyle(canvas).getPropertyValue("--foreground").trim() ||
        "#0d0d0d";
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.55;
      peaks.forEach((peak, index) => {
        const barHeight = Math.max(2, peak * (height - 10));
        ctx.fillRect(
          index * (barWidth + gap),
          (height - barHeight) / 2,
          barWidth,
          barHeight,
        );
      });
      ctx.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks]);

  function timeAt(clientX: number) {
    const track = trackRef.current;
    if (!track || duration <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }

  function dragHandle(edge: "start" | "end", event: PointerEvent<HTMLButtonElement>) {
    if (busy || duration < MIN_SPAN) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: globalThis.PointerEvent) => {
      const next = timeAt(pointer.clientX);
      mediaRef.current?.pause();
      setPlaying(false);
      if (edge === "start") {
        const from = Math.max(0, Math.min(next, end - MIN_SPAN));
        setStart(from);
        if (mediaRef.current) mediaRef.current.currentTime = from;
      } else {
        const to = Math.min(duration, Math.max(next, start + MIN_SPAN));
        setEnd(to);
        if (mediaRef.current) mediaRef.current.currentTime = start;
      }
    };
    const up = (pointer: globalThis.PointerEvent) => {
      move(pointer);
      target.releasePointerCapture(pointer.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const tooShort = end - start < MIN_SPAN;
  const canConfirm = duration >= MIN_SPAN && !tooShort && !loadError;

  if (asVideo) {
    return (
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !busy) onClose();
        }}
      >
        <DialogContent
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className="joy-canvas-chrome max-w-3xl gap-3 border-border p-3 shadow-none sm:max-w-3xl"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>剪辑</DialogTitle>
          </DialogHeader>
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : videoBlob ? (
            <VideoTrim
              className="joy-video-trim"
              src={videoBlob}
              onCancel={busy ? undefined : onClose}
              onTrim={({ startTime, endTime }) => {
                if (busy) return;
                onConfirm({ start: startTime, end: endTime });
              }}
              labels={{
                actions: { trim: busy ? "处理中…" : "确认剪辑", cancel: "取消" },
                playback: { play: "播放", pause: "暂停" },
                video: { ariaLabel: "视频预览" },
                toolbar: { ariaLabel: "剪辑选区" },
                filmstrip: {
                  loadingFrames: ({ loaded, total }) =>
                    `读取画面 ${loaded}/${total}`,
                },
                errors: {
                  decode: "无法解码这段视频",
                  sourceNotSupported: "当前浏览器不支持这个视频格式",
                  load: "无法加载视频",
                },
              }}
            />
          ) : (
            <div
              className="relative overflow-hidden rounded-xl border border-border bg-muted/40"
              aria-busy="true"
              aria-label="读取视频中"
            >
              <Skeleton className="aspect-video w-full rounded-none" />
              <div className="absolute inset-x-3 bottom-3 flex items-center gap-3 rounded-xl border border-border bg-popover p-2.5">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <Skeleton className="h-14 min-w-0 flex-1" />
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Skeleton className="h-8 w-[72px]" />
                  <Skeleton className="h-8 w-[72px]" />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome max-w-lg gap-4 border-border p-4 shadow-none sm:max-w-lg"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>截取音频</DialogTitle>
        </DialogHeader>

        <audio
          ref={mediaRef as RefObject<HTMLAudioElement>}
          src={src || undefined}
          preload="auto"
          className="hidden"
          onLoadedMetadata={(event) =>
            applyDuration(event.currentTarget.duration)
          }
          onDurationChange={(event) =>
            applyDuration(event.currentTarget.duration)
          }
        />

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}

        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-2.5 text-foreground">
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-full text-foreground hover:bg-muted disabled:opacity-40"
            aria-label={playing ? "暂停" : "试听"}
            disabled={busy || !canConfirm}
            onClick={() => {
              const media = mediaRef.current;
              if (!media) return;
              if (!media.paused) {
                media.pause();
                return;
              }
              if (media.currentTime < start || media.currentTime >= end) {
                media.currentTime = start;
              }
              void media.play().catch(() => setPlaying(false));
            }}
          >
            {playing ? (
              <CanvasIconPause className="size-4" />
            ) : (
              <CanvasIconPlay className="size-4" />
            )}
          </button>

          <div ref={trackRef} className="relative h-14 min-w-0 flex-1">
            <div className="absolute inset-0 overflow-hidden rounded-md bg-card">
              <canvas ref={waveRef} className="size-full" />
              {!peaks ? (
                <span className="absolute inset-0 grid place-items-center text-[11px] text-muted-foreground">
                  {src ? "读取波形…" : "读取音频…"}
                </span>
              ) : null}
            </div>
            {duration > 0 ? (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 rounded-l-md bg-background/70"
                  style={{ width: `${(start / duration) * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 rounded-md border-[3px] border-primary"
                  style={{
                    left: `${(start / duration) * 100}%`,
                    width: `${((end - start) / duration) * 100}%`,
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 rounded-r-md bg-background/70"
                  style={{ width: `${((duration - end) / duration) * 100}%` }}
                />
                <button
                  type="button"
                  aria-label="开始时间"
                  className="absolute inset-y-0 z-10 w-3.5 -translate-x-1/2 cursor-ew-resize rounded-l-md bg-primary"
                  style={{ left: `${(start / duration) * 100}%` }}
                  onPointerDown={(event) => dragHandle("start", event)}
                >
                  <span className="mx-auto flex h-3.5 w-full items-center justify-center gap-0.5">
                    <span className="h-3.5 w-0.5 rounded-full bg-primary-foreground/50" />
                    <span className="h-3.5 w-0.5 rounded-full bg-primary-foreground/50" />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="结束时间"
                  className="absolute inset-y-0 z-10 w-3.5 -translate-x-1/2 cursor-ew-resize rounded-r-md bg-primary"
                  style={{ left: `${(end / duration) * 100}%` }}
                  onPointerDown={(event) => dragHandle("end", event)}
                >
                  <span className="mx-auto flex h-3.5 w-full items-center justify-center gap-0.5">
                    <span className="h-3.5 w-0.5 rounded-full bg-primary-foreground/50" />
                    <span className="h-3.5 w-0.5 rounded-full bg-primary-foreground/50" />
                  </span>
                </button>
                <span className="pointer-events-none absolute bottom-1 left-3 rounded bg-foreground/75 px-1.5 py-0.5 text-[11px] tabular-nums text-background">
                  {duration > 0
                    ? formatClock(Math.max(0, end - start))
                    : "读取时长中…"}
                </span>
              </>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              className="min-w-[72px] rounded-lg bg-muted px-3 py-2 text-[13px] text-foreground disabled:opacity-40"
              disabled={busy}
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="button"
              className="min-w-[72px] rounded-lg bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground disabled:opacity-40"
              disabled={busy || !canConfirm}
              onClick={() => onConfirm({ start, end })}
            >
              {busy ? "处理中…" : "确认截取"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
