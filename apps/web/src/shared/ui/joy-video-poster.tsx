"use client";

import { useEffect, useState } from "react";
import {
  tosVideoPosterUrl,
  type MediaThumbSize,
} from "@/shared/lib/media-url";
import { cn } from "@/shared/lib/utils";

type Mode = "poster" | "video" | "empty";

type Props = {
  url: string;
  size?: MediaThumbSize;
  className?: string;
  /**
   * When the snapshot URL fails (video process off), fall back to a muted
   * metadata preview. `none` leaves the slot empty so dense grids do not
   * pull the file.
   */
  fallback?: "video" | "none";
};

/**
 * List/grid video cover: TOS snapshot image first, never the full mp4
 * unless `fallback="video"` and the snapshot is unavailable.
 */
export function JoyVideoPoster({
  url,
  size = "md",
  className,
  fallback = "none",
}: Props) {
  const poster = tosVideoPosterUrl(url, size);
  const [mode, setMode] = useState<Mode>(() =>
    poster ? "poster" : fallback === "video" ? "video" : "empty",
  );

  useEffect(() => {
    const next = tosVideoPosterUrl(url, size);
    setMode(next ? "poster" : fallback === "video" ? "video" : "empty");
  }, [url, size, fallback]);

  if (mode === "poster" && poster) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={poster}
        alt=""
        loading="lazy"
        draggable={false}
        className={cn(className)}
        onError={() => setMode(fallback === "video" ? "video" : "empty")}
      />
    );
  }

  if (mode === "video") {
    return (
      <video
        src={url}
        muted
        playsInline
        preload="metadata"
        draggable={false}
        className={cn(className)}
        onError={() => setMode("empty")}
      />
    );
  }

  return null;
}
