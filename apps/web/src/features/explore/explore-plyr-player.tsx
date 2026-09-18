"use client";

import { useEffect, useRef, useState } from "react";
import "plyr/dist/plyr.css";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
};

function guessVideoMime(url: string): string | undefined {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".ogg") || path.endsWith(".ogv")) return "video/ogg";
  if (path.endsWith(".mp4") || path.endsWith(".m4v") || path.endsWith(".mov")) {
    return "video/mp4";
  }
  return undefined;
}

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
  const [failed, setFailed] = useState(false);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || failed) return;

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
      const markFailed = () => {
        setFailed(true);
        onErrorRef.current?.();
      };

      instance.on("ready", () => {
        instance.muted = false;
        void instance.play()?.catch(() => {
          // 浏览器拦截带声自动播放时仍保持非静音，用户点播放即有声
          instance.muted = false;
        });
        markReady();
      });
      instance.on("loadeddata", markReady);
      instance.on("error", markFailed);
    });

    return () => {
      destroyed = true;
      player?.destroy();
    };
  }, [src, failed]);

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

  const mime = guessVideoMime(src);

  return (
    <video
      ref={videoRef}
      className={className}
      poster={poster || undefined}
      playsInline
      preload="metadata"
      onError={() => {
        setFailed(true);
        onErrorRef.current?.();
      }}
    >
      {mime ? <source src={src} type={mime} /> : <source src={src} />}
    </video>
  );
}
