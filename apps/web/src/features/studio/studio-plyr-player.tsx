"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import "plyr/dist/plyr.css";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
};

type PlyrLike = {
  destroy: () => void;
  playing: boolean;
  source: unknown;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
  media?: HTMLMediaElement | null;
};

/** Studio feed video — Plyr controls, no autoplay (multiple cards on page). */
export function StudioPlyrPlayer({ src, poster, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlyrLike | null>(null);
  const pendingSrcRef = useRef<string | null>(null);
  const appliedSrcRef = useRef(src);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let destroyed = false;
    let player: PlyrLike | null = null;

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !videoRef.current) return;
      player = new Plyr(videoRef.current, {
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "mute",
          "volume",
          "fullscreen",
        ],
        autoplay: false,
        muted: false,
        hideControls: true,
        resetOnEnd: false,
        ratio: undefined,
      }) as unknown as PlyrLike;
      playerRef.current = player;
      appliedSrcRef.current = src;
    });

    return () => {
      destroyed = true;
      playerRef.current = null;
      player?.destroy();
    };
    // Mount once; src hot-swaps handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (src === appliedSrcRef.current) return;
    const player = playerRef.current;
    const video = videoRef.current;
    if (!player || !video) {
      pendingSrcRef.current = src;
      return;
    }

    const apply = (next: string) => {
      appliedSrcRef.current = next;
      pendingSrcRef.current = null;
      player.source = {
        type: "video",
        sources: [{ src: next, type: "video/mp4" }],
      };
    };

    if (!player.playing) {
      apply(src);
      return;
    }

    // Don't interrupt playback — swap when user pauses or clip ends.
    pendingSrcRef.current = src;
    const flush = () => {
      const pending = pendingSrcRef.current;
      if (!pending || player.playing) return;
      apply(pending);
      player.off("pause", flush);
      player.off("ended", flush);
    };
    player.on("pause", flush);
    player.on("ended", flush);
    return () => {
      player.off("pause", flush);
      player.off("ended", flush);
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={cn("joy-studio-plyr-el", className)}
      src={src}
      poster={poster || undefined}
      playsInline
      preload="metadata"
    />
  );
}
