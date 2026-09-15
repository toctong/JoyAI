"use client";

import { useEffect, useRef } from "react";
import "plyr/dist/plyr.css";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
};

export function ExplorePlyrPlayer({
  src,
  poster,
  className,
  onReady,
  onError,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    let destroyed = false;
    let player: { destroy: () => void } | null = null;

    void import("plyr").then(({ default: Plyr }) => {
      if (destroyed || !videoRef.current) return;
      const instance = new Plyr(videoRef.current, {
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
      });
      player = instance;

      const markReady = () => onReadyRef.current?.();

      instance.on("ready", () => {
        instance.muted = false;
        void instance.play()?.catch(() => {
          // 浏览器拦截带声自动播放时仍保持非静音，用户点播放即有声
          instance.muted = false;
        });
        markReady();
      });
      instance.on("loadeddata", markReady);
      instance.on("error", () => onErrorRef.current?.());
    });

    return () => {
      destroyed = true;
      player?.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={src}
      poster={poster || undefined}
      playsInline
      preload="metadata"
      onError={() => onErrorRef.current?.()}
    />
  );
}
