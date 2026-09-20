"use client";

import { useEffect, useState } from "react";
import { CanvasIconImage, CanvasIconPlay } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

type Props = {
  url: string | null | undefined;
  className?: string;
  emptyClassName?: string;
  /** Show a small play mark when the cover is a video frame. */
  showVideoMark?: boolean;
};

function isLikelyVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function initialMode(url: string | null | undefined): "img" | "video" | "empty" {
  if (!url) return "empty";
  return isLikelyVideoUrl(url) ? "video" : "img";
}

/** Project / folder poster: images as img, videos as muted first-frame preview. */
export function ProjectCover({
  url,
  className,
  emptyClassName,
  showVideoMark = true,
}: Props) {
  const [mode, setMode] = useState<"img" | "video" | "empty">(() =>
    initialMode(url),
  );

  useEffect(() => {
    setMode(initialMode(url));
  }, [url]);

  if (!url || mode === "empty") {
    return (
      <div className={cn("joy-projects-cover-empty", emptyClassName)}>
        <CanvasIconImage />
      </div>
    );
  }

  if (mode === "video") {
    return (
      <span className={cn("joy-projects-cover-wrap", className)}>
        <video
          src={url}
          className="joy-projects-cover"
          muted
          playsInline
          preload="metadata"
          draggable={false}
          onLoadedMetadata={(event) => {
            try {
              event.currentTarget.currentTime = 0.05;
            } catch {
              /* ignore seek failures */
            }
          }}
          onError={() => setMode("empty")}
        />
        {showVideoMark ? (
          <span className="joy-projects-cover-play" aria-hidden>
            <CanvasIconPlay className="size-3.5" />
          </span>
        ) : null}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={cn("joy-projects-cover", className)}
      draggable={false}
      onError={() => setMode("video")}
    />
  );
}
