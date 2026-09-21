"use client";

import {
  CanvasIconAudio,
  CanvasIconFile,
  CanvasIconImage,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { JoyRemoteImg } from "@/shared/ui/joy-remote-img";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { cn } from "@/shared/lib/utils";

type Props = {
  kind: string;
  url?: string;
  className?: string;
};

/** Thumbnail for a canvas reference: image, video frame, or a type icon. */
export function CanvasRefThumb({ kind, url, className }: Props) {
  const src = String(url ?? "").trim();
  const visual = Boolean(src) && !src.startsWith("data:") && !src.startsWith("blob:");

  if ((kind === "image" || kind === "panorama") && visual) {
    return (
      <JoyRemoteImg
        src={src}
        alt=""
        draggable={false}
        className={cn("pointer-events-none size-full select-none object-cover", className)}
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

  const Icon =
    kind === "video"
      ? CanvasIconVideo
      : kind === "audio"
        ? CanvasIconAudio
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
      <Icon className="size-4" />
    </span>
  );
}
