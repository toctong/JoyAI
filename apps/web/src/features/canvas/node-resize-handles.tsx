"use client";

import { useRef } from "react";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { nodeBox } from "./lib/node-box";
import { cn } from "@/shared/lib/utils";

export type ResizeCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

const MIN_W = 140;
const MIN_H = 88;

type Props = {
  node: CanvasNode;
  zoom: number;
  onResizingChange?: (resizing: boolean) => void;
};

/**
 * Four-corner resize for the selected node (world-space).
 * Image/video/panorama keep aspect unless `data.freeResize`.
 * Shift flips that default for the current drag.
 */
export function NodeResizeHandles({ node, zoom, onResizingChange }: Props) {
  const resizeNode = useCanvasStore((s) => s.resizeNode);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const session = useRef<{
    corner: ResizeCorner;
    startX: number;
    startY: number;
    left: number;
    top: number;
    width: number;
    height: number;
    lockByDefault: boolean;
    ratio: number;
  } | null>(null);

  function start(e: React.PointerEvent, corner: ResizeCorner) {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    const box = nodeBox(node);
    const media =
      node.type === "image" ||
      node.type === "video" ||
      node.type === "panorama";
    session.current = {
      corner,
      startX: e.clientX,
      startY: e.clientY,
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      lockByDefault: media && !node.data.freeResize,
      ratio: box.width / Math.max(1, box.height),
    };
    onResizingChange?.(true);

    const onMove = (ev: PointerEvent) => {
      const s = session.current;
      if (!s) return;
      const dx = (ev.clientX - s.startX) / zoom;
      const dy = (ev.clientY - s.startY) / zoom;
      const fromLeft = s.corner.includes("left");
      const fromTop = s.corner.includes("top");
      const startRight = s.left + s.width;
      const startBottom = s.top + s.height;

      let width = Math.max(MIN_W, s.width + (fromLeft ? -dx : dx));
      let height = Math.max(MIN_H, s.height + (fromTop ? -dy : dy));

      const lock = s.lockByDefault ? !ev.shiftKey : ev.shiftKey;
      if (lock) {
        const ratio = s.ratio || width / height;
        if (Math.abs(dx) >= Math.abs(dy)) {
          height = width / ratio;
        } else {
          width = height * ratio;
        }
        if (height < MIN_H) {
          height = MIN_H;
          width = height * ratio;
        }
        if (width < MIN_W) {
          width = MIN_W;
          height = width / ratio;
        }
      }

      resizeNode(node.id, {
        width,
        height,
        x: fromLeft ? startRight - width : s.left,
        y: fromTop ? startBottom - height : s.top,
      });
    };

    const onUp = () => {
      session.current = null;
      onResizingChange?.(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const corners: ResizeCorner[] = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  const posClass: Record<ResizeCorner, string> = {
    "top-left": "-left-1.5 -top-1.5 cursor-nwse-resize",
    "top-right": "-right-1.5 -top-1.5 cursor-nesw-resize",
    "bottom-left": "-left-1.5 -bottom-1.5 cursor-nesw-resize",
    "bottom-right": "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  };

  const box = nodeBox(node);

  return (
    <div
      className="pointer-events-none absolute z-[40000]"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      {corners.map((corner) => (
        <button
          key={corner}
          type="button"
          aria-label={`缩放 ${corner}`}
          className={cn(
            "pointer-events-auto absolute z-30 size-2.5 rounded-full border border-foreground/80 bg-background",
            posClass[corner],
          )}
          onPointerDown={(e) => start(e, corner)}
        />
      ))}
    </div>
  );
}
