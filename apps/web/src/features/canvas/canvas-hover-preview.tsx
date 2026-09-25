"use client";

import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { JoyReleasedVideo } from "@/shared/ui/joy-released-video";

export type HoverPreviewPayload = {
  title?: string;
  kind?: "image" | "video" | "audio" | "other";
  url?: string;
  icon?: ReactNode;
};

type Props = {
  preview: HoverPreviewPayload | null;
  /** Place preview to the left of the host panel. */
  className?: string;
};

/** Large media preview that sits beside a list card while hovering a row. */
export function CanvasHoverPreview({ preview, className }: Props) {
  if (!preview) return null;
  const url = String(preview.url ?? "").trim();
  const visual =
    Boolean(url) && !url.startsWith("data:") && !url.startsWith("blob:");
  const kind = preview.kind ?? "image";

  // Only show a floating preview when there is real media to look at.
  if (!visual) return null;

  return (
    <div
      className={cn(
        "joy-canvas-chrome pointer-events-none absolute right-full top-0 z-[85] mr-3 w-[220px] overflow-hidden rounded-2xl border border-border shadow-xl",
        className,
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {kind === "video" ? (
          <JoyReleasedVideo
            src={url.includes("#") ? url : `${url}#t=0.1`}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        )}
      </div>
    </div>
  );
}
