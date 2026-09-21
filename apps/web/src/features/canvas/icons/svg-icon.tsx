"use client";

import { cn } from "@/shared/lib/utils";

export type CanvasSvgName =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "panorama"
  | "director"
  | "prompt"
  | "upload"
  | "folder"
  | "subject"
  | "select"
  | "hand"
  | "undo"
  | "redo"
  | "trash"
  | "eraser"
  | "group"
  | "grid"
  | "dots"
  | "blank"
  | "snap"
  | "palette"
  | "minimap"
  | "fit"
  | "help"
  | "search"
  | "history"
  | "panel-close"
  | "link"
  | "play"
  | "share"
  | "copy"
  | "download"
  | "close"
  | "info"
  | "pencil"
  | "scissors"
  | "maximize"
  | "lock"
  | "unlock"
  | "retry"
  | "plus"
  | "minus"
  | "camera"
  | "brush"
  | "outpaint"
  | "inpaint"
  | "frame"
  | "check"
  | "pause"
  | "zoom-in"
  | "zoom-out"
  | "file"
  | "panel-bottom"
  | "message"
  | "align-left"
  | "align-right"
  | "align-center-h"
  | "align-center-v"
  | "align-top"
  | "align-bottom"
  | "distribute-h"
  | "distribute-v"
  | "bring-front"
  | "send-back"
  | "ungroup"
  | "menu"
  | "home"
  | "panel-open"
  | "alert"
  | "loader"
  | "wand"
  | "keyboard"
  | "more"
  | "chevron-left"
  | "move"
  | "folder-plus";

type Props = {
  name: CanvasSvgName;
  className?: string;
  title?: string;
};

const CANVAS_ICON_REV = "director-cube-1";

/**
 * Canvas icons from `/public/canvas-icons/*.svg` (Lucide outline → CSS mask).
 * Brand marks from thesvg.org live beside them as `brand-*.svg` files.
 */
export function CanvasSvg({ name, className, title }: Props) {
  return (
    <span
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn(
        "joy-canvas-tool-icon inline-block shrink-0 bg-current",
        className,
      )}
      style={{
        WebkitMaskImage: `url(/canvas-icons/${name}.svg?v=${CANVAS_ICON_REV})`,
        maskImage: `url(/canvas-icons/${name}.svg?v=${CANVAS_ICON_REV})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/** Brand SVG downloaded from https://thesvg.org (OpenAI default). */
export function BrandOpenAiIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/canvas-icons/brand-openai-default.svg"
      alt=""
      aria-hidden
      className={cn("joy-canvas-tool-icon object-contain", className)}
      draggable={false}
    />
  );
}
