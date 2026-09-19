"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import "plyr/dist/plyr.css";
import "./canvas-audio-player.css";

type Props = {
  src: string;
  className?: string;
};

type PlyrLike = {
  destroy: () => void;
};

/**
 * Compact canvas audio bar. Plyr replaces the native `<audio controls>` chrome.
 * MediaRecorder WebM often reports duration as Infinity until a seek — we force
 * a metadata probe so the duration control shows a real length.
 */
export function CanvasAudioPlayer({ src, className }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    let destroyed = false;
    let player: PlyrLike | null = null;

    const forceWebmDuration = () => {
      if (!el || destroyed) return;
      if (Number.isFinite(el.duration) && el.duration > 0) return;
      const onTimeUpdate = () => {
        el.removeEventListener("timeupdate", onTimeUpdate);
        el.currentTime = 0;
      };
      el.addEventListener("timeupdate", onTimeUpdate);
      try {
        el.currentTime = 1e101;
      } catch {
        el.removeEventListener("timeupdate", onTimeUpdate);
      }
    };

    el.addEventListener("loadedmetadata", forceWebmDuration);
    el.addEventListener("durationchange", forceWebmDuration);

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !audioRef.current) return;
      const instance = new Plyr(audioRef.current, {
        controls: [
          "play",
          "current-time",
          "progress",
          "duration",
          "mute",
          "settings",
        ],
        settings: ["speed"],
        speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] },
        volume: 0.8,
        tooltips: { controls: false, seek: true },
        keyboard: { focused: true, global: false },
        invertTime: false,
      });
      player = instance;
      const root = audioRef.current.closest(".plyr");
      root?.setAttribute("data-canvas-no-zoom", "");
      root?.setAttribute("data-canvas-shortcuts-ignore", "");
      forceWebmDuration();
    });

    return () => {
      destroyed = true;
      el.removeEventListener("loadedmetadata", forceWebmDuration);
      el.removeEventListener("durationchange", forceWebmDuration);
      player?.destroy();
    };
  }, [src]);

  return (
    <div
      className={cn("joy-canvas-audio", className)}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => event.preventDefault()}
    >
      <audio ref={audioRef} src={src} preload="metadata" />
    </div>
  );
}
