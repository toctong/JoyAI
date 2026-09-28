"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";
import { releaseHtmlMedia } from "@/shared/lib/release-media";
import {
  claimAudibleMedia,
  releaseAudibleMedia,
} from "@/shared/lib/exclusive-audible-media";
import "plyr/dist/plyr.css";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  autoPlay?: boolean;
  onEnded?: () => void;
  /** Fired once when intrinsic video dimensions are known (e.g. adaptive ratio). */
  onNaturalAspect?: (ratio: string) => void;
};

type PlyrLike = {
  destroy: () => void;
  playing: boolean;
  muted: boolean;
  volume: number;
  pause: () => void;
  source: unknown;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
  media?: HTMLMediaElement | null;
};

function applyMediaAttrs(
  el: HTMLVideoElement,
  src: string,
  poster?: string | null,
) {
  if (el.getAttribute("src") !== src) {
    el.src = src;
  }
  if (poster) el.poster = poster;
  else el.removeAttribute("poster");
}

function hasPlayableSrc(el: HTMLVideoElement) {
  return Boolean(el.currentSrc || el.getAttribute("src"));
}

/** Studio feed video — Plyr controls, no autoplay (multiple cards on page). */
export function StudioPlyrPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  onEnded,
  onNaturalAspect,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<PlyrLike | null>(null);
  const pendingSrcRef = useRef<string | null>(null);
  const appliedSrcRef = useRef(src);
  const srcRef = useRef(src);
  const posterRef = useRef(poster);
  const onNaturalAspectRef = useRef(onNaturalAspect);
  const onEndedRef = useRef(onEnded);
  srcRef.current = src;
  posterRef.current = poster;
  onNaturalAspectRef.current = onNaturalAspect;
  onEndedRef.current = onEnded;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let destroyed = false;
    let player: PlyrLike | null = null;

    const stopAudible = () => {
      try {
        player?.pause();
      } catch {
        /* ignore */
      }
      releaseAudibleMedia(stopAudible);
    };

    const syncAudible = () => {
      if (destroyed || !player) return;
      const loud = player.playing && !player.muted && player.volume > 0;
      if (loud) claimAudibleMedia(stopAudible);
      else releaseAudibleMedia(stopAudible);
    };

    const reportAspect = () => {
      const v = videoRef.current;
      if (!v || v.videoWidth <= 0 || v.videoHeight <= 0) return;
      onNaturalAspectRef.current?.(`${v.videoWidth} / ${v.videoHeight}`);
    };

    el.addEventListener("loadedmetadata", reportAspect);
    if (el.readyState >= 1) reportAspect();

    const handleEnded = () => onEndedRef.current?.();
    el.addEventListener("ended", handleEnded);

    // Strict Mode / Plyr destroy call releaseHtmlMedia which strips `src`.
    // Re-apply before init so we never mount Plyr on an empty element.
    applyMediaAttrs(el, srcRef.current, posterRef.current);
    appliedSrcRef.current = srcRef.current;

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !videoRef.current) return;
      applyMediaAttrs(videoRef.current, srcRef.current, posterRef.current);
      player = new Plyr(videoRef.current, {
        controls: [
          "play-large",
          "play",
          "current-time",
          "progress",
          "mute",
          "fullscreen",
        ],
        autoplay: autoPlay,
        muted: false,
        hideControls: true,
        resetOnEnd: false,
        ratio: undefined,
        volume: 0.8,
        tooltips: { controls: false, seek: true },
        keyboard: { focused: true, global: false },
      }) as unknown as PlyrLike;
      playerRef.current = player;
      appliedSrcRef.current = srcRef.current;
      player.on("ended", handleEnded);
      player.on("playing", syncAudible);
      player.on("pause", syncAudible);
      player.on("volumechange", syncAudible);
      reportAspect();
      if (autoPlay) {
        void videoRef.current.play().catch(() => undefined);
      }
      syncAudible();
    });

    return () => {
      destroyed = true;
      releaseAudibleMedia(stopAudible);
      el.removeEventListener("loadedmetadata", reportAspect);
      el.removeEventListener("ended", handleEnded);
      playerRef.current = null;
      player?.off("ended", handleEnded);
      player?.off("playing", syncAudible);
      player?.off("pause", syncAudible);
      player?.off("volumechange", syncAudible);
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      releaseHtmlMedia(el);
    };
    // Mount once; src hot-swaps handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const video = videoRef.current;
    const needsRestore = Boolean(video && src && !hasPlayableSrc(video));
    if (src === appliedSrcRef.current && !needsRestore) {
      if (video) applyMediaAttrs(video, src, poster);
      return;
    }
    if (!player || !video) {
      pendingSrcRef.current = src;
      if (video && src) applyMediaAttrs(video, src, poster);
      return;
    }

    const apply = (next: string) => {
      appliedSrcRef.current = next;
      pendingSrcRef.current = null;
      applyMediaAttrs(video, next, poster);
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
  }, [src, poster]);

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
