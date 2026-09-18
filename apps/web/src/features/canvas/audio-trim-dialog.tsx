"use client";

import {
  CanvasIconPause,
  CanvasIconPlay,
} from "./icons/canvas-icons";
import { useEffect, useRef, useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  url: string;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (range: { start: number; end: number }) => void;
};

const MIN_SPAN = 0.5;

function isProbablyVideo(url: string) {
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url);
}

export function AudioTrimDialog({
  url,
  open,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const mediaRef = useRef<HTMLMediaElement>(null);
  const asVideo = isProbablyVideo(url);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!open) {
      mediaRef.current?.pause();
      return;
    }
    setDuration(0);
    setStart(0);
    setEnd(0);
    setPlaying(false);
  }, [open, url]);

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
  }, [start, end]);

  function applyDuration(next: number) {
    if (!Number.isFinite(next) || next <= 0) return;
    setDuration(next);
    setStart(0);
    setEnd(next);
  }

  const tooShort = end - start < MIN_SPAN;
  const canConfirm = duration >= MIN_SPAN && !tooShort;

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
        className="max-w-sm"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>截取音频</DialogTitle>
          <DialogDescription>
            拖动选区，至少 0.5 秒。结果上传为新的音频节点。
          </DialogDescription>
        </DialogHeader>
        {asVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={open ? url : undefined}
            preload="metadata"
            crossOrigin="anonymous"
            className="hidden"
            onLoadedMetadata={(event) =>
              applyDuration(event.currentTarget.duration)
            }
          />
        ) : (
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={open ? url : undefined}
            preload="metadata"
            crossOrigin="anonymous"
            className="hidden"
            onLoadedMetadata={(event) =>
              applyDuration(event.currentTarget.duration)
            }
          />
        )}
        <div className="space-y-3">
          <SliderPrimitive.Root
            className="relative flex w-full touch-none select-none items-center"
            min={0}
            max={duration || 1}
            step={0.01}
            minStepsBetweenThumbs={1}
            value={[start, end || duration || 1]}
            disabled={busy || duration < MIN_SPAN}
            onValueChange={([nextStart, nextEnd]) => {
              if (nextEnd - nextStart < MIN_SPAN) return;
              mediaRef.current?.pause();
              if (mediaRef.current) mediaRef.current.currentTime = nextStart;
              setStart(nextStart);
              setEnd(nextEnd);
              setPlaying(false);
            }}
          >
            <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
              <SliderPrimitive.Range className="absolute h-full bg-foreground" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              aria-label="截取开始时间"
              className="block size-4 rounded-full border border-foreground/20 bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <SliderPrimitive.Thumb
              aria-label="截取结束时间"
              className="block size-4 rounded-full border border-foreground/20 bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </SliderPrimitive.Root>
          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>{start.toFixed(2)} 秒</span>
            <span>
              {duration > 0
                ? `选中 ${Math.max(0, end - start).toFixed(2)} 秒`
                : "读取时长中…"}
            </span>
            <span>{end.toFixed(2)} 秒</span>
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
              {playing ? <CanvasIconPause /> : <CanvasIconPlay />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={busy || !canConfirm}
            onClick={() => onConfirm({ start, end })}
          >
            {busy ? "截取中…" : "确认截取"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
