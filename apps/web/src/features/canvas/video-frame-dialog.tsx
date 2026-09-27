"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CanvasIconPlay } from "./icons/canvas-icons";
import { fetchRemoteVideoBlob } from "./lib/load-canvas-video";
import "./canvas-chrome.css";

type Props = {
  url: string;
  open: boolean;
  busy?: boolean;
  /** Prefer starting at current playback time when opening. */
  initialTime?: number;
  onClose: () => void;
  onConfirm: (time: number) => void;
};

const FILMSTRIP_COUNT = 12;
/** Approximate frame step for ← → */
const FRAME_STEP = 1 / 24;

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function clampTime(time: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(time, Math.max(0, duration - 0.001)));
}

export function VideoFramePickDialog({
  url,
  open,
  busy = false,
  initialTime = 0,
  onClose,
  onConfirm,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState("");
  const [loadError, setLoadError] = useState("");
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [thumbsLoading, setThumbsLoading] = useState(false);

  useEffect(() => {
    if (!open || !url) {
      videoRef.current?.pause();
      setSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return "";
      });
      setLoadError("");
      setDuration(0);
      setTime(0);
      setPlaying(false);
      setThumbs((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item));
        return [];
      });
      return;
    }

    let cancelled = false;
    let objectUrl = "";
    setLoadError("");
    setDuration(0);
    setTime(Math.max(0, initialTime));
    setPlaying(false);
    setThumbs([]);

    async function load() {
      try {
        const blob = /^https?:/i.test(url)
          ? await fetchRemoteVideoBlob(url)
          : await fetch(url).then((res) => {
              if (!res.ok) throw new Error("无法加载视频");
              return res.blob();
            });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "无法加载视频",
          );
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url, initialTime]);

  useEffect(() => {
    if (!open || !src) return;
    let cancelled = false;

    async function buildFilmstrip() {
      setThumbsLoading(true);
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = src;
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("无法读取画面"));
        });
        const dur = Number.isFinite(video.duration) ? video.duration : 0;
        if (dur <= 0) {
          if (!cancelled) setThumbs([]);
          return;
        }
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const next: string[] = [];
        const lastIndex = Math.max(1, FILMSTRIP_COUNT - 1);
        for (let i = 0; i < FILMSTRIP_COUNT; i += 1) {
          const t =
            (i / lastIndex) * Math.max(0, dur - 0.04);
          await new Promise<void>((resolve, reject) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              video.removeEventListener("error", onError);
              resolve();
            };
            const onError = () => {
              video.removeEventListener("seeked", onSeeked);
              video.removeEventListener("error", onError);
              reject(new Error("定位失败"));
            };
            video.addEventListener("seeked", onSeeked);
            video.addEventListener("error", onError);
            video.currentTime = t;
          });
          if (cancelled) return;
          const w = video.videoWidth || 320;
          const h = video.videoHeight || 180;
          canvas.width = 120;
          canvas.height = Math.max(1, Math.round((120 * h) / w));
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", 0.72),
          );
          if (blob) next.push(URL.createObjectURL(blob));
        }
        if (!cancelled) {
          setThumbs((prev) => {
            prev.forEach((item) => URL.revokeObjectURL(item));
            return next;
          });
        } else {
          next.forEach((item) => URL.revokeObjectURL(item));
        }
      } catch {
        if (!cancelled) setThumbs([]);
      } finally {
        video.removeAttribute("src");
        video.load();
        if (!cancelled) setThumbsLoading(false);
      }
    }

    void buildFilmstrip();
    return () => {
      cancelled = true;
    };
  }, [open, src]);

  const seekTo = useCallback(
    (next: number, playAfter = false) => {
      const video = videoRef.current;
      if (!video) return;
      const clamped = clampTime(next, duration || video.duration || 0);
      video.currentTime = clamped;
      setTime(clamped);
      if (!playAfter) {
        video.pause();
        setPlaying(false);
      }
    },
    [duration],
  );

  function nudge(delta: number) {
    seekTo(time + delta);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video || busy) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => undefined);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  function onTrackPointer(clientX: number) {
    const track = trackRef.current;
    if (!track || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (busy || loadError) return;
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (duration > 0) onConfirm(time);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(event.shiftKey ? -1 : -FRAME_STEP);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(event.shiftKey ? 1 : FRAME_STEP);
    }
  }

  const progress = duration > 0 ? time / duration : 0;
  const canConfirm = Boolean(src) && duration > 0 && !loadError && !busy;

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
        className="joy-canvas-chrome flex max-h-[min(92vh,820px)] max-w-3xl flex-col gap-3 overflow-hidden border-border p-4 shadow-none sm:max-w-3xl"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={onDialogKeyDown}
      >
        <DialogHeader>
          <DialogTitle>抽取视频帧</DialogTitle>
        </DialogHeader>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}

        <div className="relative overflow-hidden rounded-xl border border-border bg-muted/40">
          {src ? (
            <>
              <video
                ref={videoRef}
                src={src}
                className="aspect-video w-full bg-black object-contain"
                playsInline
                preload="auto"
                onLoadedMetadata={(event) => {
                  const next = event.currentTarget.duration;
                  setDuration(Number.isFinite(next) ? next : 0);
                  const start = clampTime(initialTime, next);
                  event.currentTarget.currentTime = start;
                  setTime(start);
                }}
                onTimeUpdate={(event) => {
                  setTime(event.currentTarget.currentTime);
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onClick={togglePlay}
              />
              {!playing ? (
                <button
                  type="button"
                  className="absolute inset-0 grid place-items-center bg-black/15"
                  aria-label="播放"
                  onClick={togglePlay}
                >
                  <span className="grid size-14 place-items-center rounded-full bg-black/55 text-white">
                    <CanvasIconPlay className="size-7 translate-x-0.5" />
                  </span>
                </button>
              ) : null}
            </>
          ) : (
            <Skeleton className="aspect-video w-full rounded-none" />
          )}
        </div>

        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
            <div className="flex h-14 w-full">
              {thumbsLoading && thumbs.length === 0
                ? Array.from({ length: FILMSTRIP_COUNT }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="h-full min-w-0 flex-1 rounded-none border-r border-border/40 last:border-r-0"
                    />
                  ))
                : thumbs.map((thumb, i) => (
                    <button
                      key={thumb}
                      type="button"
                      className="relative h-full min-w-0 flex-1 overflow-hidden border-r border-border/40 last:border-r-0"
                      onClick={() => {
                        if (duration <= 0) return;
                        seekTo(
                          (i / Math.max(1, FILMSTRIP_COUNT - 1)) * duration,
                        );
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumb}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    </button>
                  ))}
            </div>
          </div>

          <div
            ref={trackRef}
            className="relative h-5 cursor-pointer"
            onPointerDown={(event) => {
              if (busy || duration <= 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onTrackPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                return;
              }
              onTrackPointer(event.clientX);
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-primary shadow"
              style={{ left: `${progress * 100}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[12px] tabular-nums text-muted-foreground">
            <span>{formatClock(time)}</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>

        <Button
          type="button"
          className="w-full"
          disabled={!canConfirm}
          onClick={() => onConfirm(time)}
        >
          {busy ? "处理中…" : `确认抽帧 (${formatClock(time)})`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
