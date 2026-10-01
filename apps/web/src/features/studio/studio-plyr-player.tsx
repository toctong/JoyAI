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

/**
 * Studio / 漫剧预览播放器。
 * 视频节点由宿主 div 命令式挂载（非 React 子节点），避免 Plyr 改父节点后
 * React unmount 触发 NotFoundError: removeChild。
 */
export function StudioPlyrPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  onEnded,
  onNaturalAspect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<PlyrLike | null>(null);
  const pendingSrcRef = useRef<string | null>(null);
  const appliedSrcRef = useRef(src);
  const srcRef = useRef(src);
  const posterRef = useRef(poster);
  const onNaturalAspectRef = useRef(onNaturalAspect);
  const onEndedRef = useRef(onEnded);
  const autoPlayRef = useRef(autoPlay);
  srcRef.current = src;
  posterRef.current = poster;
  onNaturalAspectRef.current = onNaturalAspect;
  onEndedRef.current = onEnded;
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let destroyed = false;
    let player: PlyrLike | null = null;

    const video = document.createElement("video");
    video.className = "joy-studio-plyr-el";
    video.playsInline = true;
    video.preload = "metadata";
    if (posterRef.current) video.poster = posterRef.current;
    video.src = srcRef.current;
    host.appendChild(video);
    videoRef.current = video;
    appliedSrcRef.current = srcRef.current;

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

    const handleEnded = () => onEndedRef.current?.();

    video.addEventListener("loadedmetadata", reportAspect);
    video.addEventListener("ended", handleEnded);
    if (video.readyState >= 1) reportAspect();

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !video.isConnected) return;
      player = new Plyr(video, {
        controls: [
          "play-large",
          "play",
          "current-time",
          "progress",
          "mute",
          "fullscreen",
        ],
        autoplay: autoPlayRef.current,
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
      if (autoPlayRef.current) {
        void video.play().catch(() => undefined);
      }
      syncAudible();
    });

    return () => {
      destroyed = true;
      releaseAudibleMedia(stopAudible);
      video.removeEventListener("loadedmetadata", reportAspect);
      video.removeEventListener("ended", handleEnded);
      playerRef.current = null;
      videoRef.current = null;
      try {
        player?.off("ended", handleEnded);
        player?.off("playing", syncAudible);
        player?.off("pause", syncAudible);
        player?.off("volumechange", syncAudible);
      } catch {
        /* ignore */
      }
      try {
        player?.destroy();
      } catch {
        /* Plyr may already have detached the node */
      }
      releaseHtmlMedia(video);
      try {
        if (video.parentNode) video.parentNode.removeChild(video);
      } catch {
        /* already gone */
      }
      try {
        while (host.firstChild) {
          host.removeChild(host.firstChild);
        }
      } catch {
        /* ignore */
      }
    };
    // Mount once per host; src hot-swaps handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    const video = videoRef.current;
    if (!video) return;

    const needsRestore = Boolean(
      src && !(video.currentSrc || video.getAttribute("src")),
    );
    if (src === appliedSrcRef.current && !needsRestore) {
      if (poster) video.poster = poster;
      else video.removeAttribute("poster");
      return;
    }

    const applyAttrs = (next: string) => {
      if (video.getAttribute("src") !== next) video.src = next;
      if (poster) video.poster = poster;
      else video.removeAttribute("poster");
    };

    if (!player) {
      pendingSrcRef.current = src;
      if (src) applyAttrs(src);
      return;
    }

    const apply = (next: string) => {
      appliedSrcRef.current = next;
      pendingSrcRef.current = null;
      applyAttrs(next);
      player.source = {
        type: "video",
        sources: [{ src: next, type: "video/mp4" }],
      };
    };

    if (!player.playing) {
      apply(src);
      return;
    }

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
    <div
      ref={hostRef}
      className={cn("joy-studio-plyr-host", className)}
    />
  );
}
