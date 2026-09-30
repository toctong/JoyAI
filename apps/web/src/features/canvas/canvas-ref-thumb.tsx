"use client";

import {
  CanvasIconAudio,
  CanvasIconFile,
  CanvasIconImage,
  CanvasIconText,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { JoyRemoteImg } from "@/shared/ui/joy-remote-img";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { cn } from "@/shared/lib/utils";
import "./canvas-ref-thumb.css";

type Props = {
  kind: string;
  url?: string;
  className?: string;
};

/** Thumbnail for a canvas reference: image, video frame, or a type icon. */
export function CanvasRefThumb({ kind, url, className }: Props) {
  const src = String(url ?? "").trim();
  const visual = Boolean(src) && !src.startsWith("data:");

  if ((kind === "image" || kind === "panorama") && visual) {
    return (
      <JoyRemoteImg
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "pointer-events-none size-full select-none object-cover",
          className,
        )}
        onDragStart={(event) => event.preventDefault()}
      />
    );
  }

  if (kind === "video" && visual) {
    return (
      <JoyVideoPoster
        url={src}
        size="sm"
        fallback="video"
        className={cn(
          "pointer-events-none size-full select-none object-cover",
          className,
        )}
      />
    );
  }

  if (kind === "audio") {
    return (
      <span
        className={cn("joy-canvas-ref-audio", className)}
        aria-hidden
      >
        <span className="joy-canvas-ref-audio__wave" aria-hidden>
          <i /><i /><i /><i /><i /><i /><i /><i /><i />
        </span>
        <CanvasIconAudio className="joy-canvas-ref-audio__icon" />
      </span>
    );
  }

  if (kind === "text") {
    return (
      <span
        className={cn(
          "grid size-full place-items-center bg-muted/80 text-muted-foreground",
          className,
        )}
      >
        <CanvasIconText className="size-7 opacity-70" />
      </span>
    );
  }

  const Icon =
    kind === "video"
      ? CanvasIconVideo
      : kind === "image" || kind === "panorama"
        ? CanvasIconImage
        : CanvasIconFile;

  return (
    <span
      className={cn(
        "grid size-full place-items-center text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-7 opacity-70" />
    </span>
  );
}
