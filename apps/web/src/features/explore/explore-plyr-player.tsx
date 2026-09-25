"use client";

import { useEffect, useRef, useState } from "react";
import "plyr/dist/plyr.css";
import { cn } from "@/shared/lib/utils";
import { releaseHtmlMedia } from "@/shared/lib/release-media";
import {
  claimAudibleMedia,
  releaseAudibleMedia,
} from "@/shared/lib/exclusive-audible-media";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
};

type PlyrInstance = {
  destroy: () => void;
  muted: boolean;
  volume: number;
  playing: boolean;
  pause: () => void;
  play: () => Promise<void> | void;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
};

/**
 * Detail / dialog video with Plyr.
 * Video uses `src` attr only (no React <source> children) so Plyr can
 * reparent safely without removeChild fights on unmount.
 */
export function ExplorePlyrPlayer({
  src,
  poster,
  className,
  onReady,
  onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const [failed, setFailed] = useState(false);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || failed) return;

    let destroyed = false;
    let player: PlyrInstance | null = null;

    const video = document.createElement("video");
    video.playsInline = true;
    video.preload = "metadata";
    if (poster) video.poster = poster;
    video.src = src;
    host.appendChild(video);
    videoRef.current = video;

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

    const onVideoError = () => {
      setFailed(true);
      onErrorRef.current?.();
    };
    video.addEventListener("error", onVideoError);

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !video.isConnected) return;
      const instance = new Plyr(video, {
        controls: [
          "play-large",
          "play",
          "progress",
          "current-time",
          "mute",
          "volume",
          "fullscreen",
        ],
        autoplay: true,
        muted: false,
        volume: 1,
        loop: { active: true },
        hideControls: false,
      }) as unknown as PlyrInstance;
      player = instance;

      const markReady = () => onReadyRef.current?.();
      const markFailed = () => {
        setFailed(true);
        onErrorRef.current?.();
      };

      instance.on("ready", () => {
        instance.muted = false;
        void Promise.resolve(instance.play()).catch(() => {
          instance.muted = false;
        });
        markReady();
        syncAudible();
      });
      instance.on("playing", syncAudible);
      instance.on("pause", syncAudible);
      instance.on("volumechange", syncAudible);
      instance.on("loadeddata", markReady);
      instance.on("error", markFailed);
    });

    return () => {
      destroyed = true;
      releaseAudibleMedia(stopAudible);
      video.removeEventListener("error", onVideoError);
      try {
        player?.destroy();
      } catch {
        /* Plyr may already have detached the node */
      }
      player = null;
      releaseHtmlMedia(video);
      videoRef.current = null;
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
  }, [src, poster, failed]);

  if (failed) {
    return poster ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        className={className}
        onLoad={() => onReadyRef.current?.()}
      />
    ) : (
      <div className={className} style={{ display: "grid", placeItems: "center" }}>
        <span style={{ color: "rgba(255,255,255,.7)", fontSize: 13 }}>
          视频源暂不可播放
        </span>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn("joy-explore-plyr-host", className)}
    />
  );
}
