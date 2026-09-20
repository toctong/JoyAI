"use client";

import { useEffect, useRef } from "react";
import {
  useActiveWallpaper,
  useAppearanceStore,
} from "./appearance-store";

type WallpaperLayerProps = {
  /** Hide on canvas editor — dark board should stay neutral */
  disabled?: boolean;
};

export function WallpaperLayer({ disabled = false }: WallpaperLayerProps) {
  const wallpaper = useActiveWallpaper();
  const paused = useAppearanceStore((s) => s.paused);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (paused) {
      el.pause();
    } else {
      void el.play().catch(() => undefined);
    }
  }, [paused, wallpaper?.id, wallpaper?.src]);

  useEffect(() => {
    const onVis = () => {
      const el = videoRef.current;
      if (!el || wallpaper?.kind !== "video") return;
      if (document.hidden) el.pause();
      else if (!useAppearanceStore.getState().paused) {
        void el.play().catch(() => undefined);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [wallpaper?.kind]);

  if (disabled || !wallpaper || wallpaper.kind === "stage") return null;

  return (
    <div className="joy-wallpaper" aria-hidden>
      {wallpaper.kind === "video" ? (
        <video
          key={wallpaper.id}
          ref={videoRef}
          className="joy-wallpaper-media"
          src={wallpaper.src}
          muted
          loop
          playsInline
          preload="auto"
          autoPlay={!paused}
          disablePictureInPicture
          controls={false}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={wallpaper.id}
          className="joy-wallpaper-media"
          src={wallpaper.src}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
}
