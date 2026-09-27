"use client";

import { useRef } from "react";
import { MoveDiagonal2 } from "lucide-react";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { nodeBox } from "./lib/node-box";
import { cn } from "@/shared/lib/utils";

const MIN_W = 140;
const MIN_H = 88;

type Props = {
  node: CanvasNode;
  zoom: number;
  visible: boolean;
  onResizingChange?: (resizing: boolean) => void;
};

/**
 * Bottom-center stretch control for a selected node (world-space).
 * Image/video/panorama keep aspect unless `data.freeResize`.
 * Shift flips that default for the current drag.
 */
export function NodeResizeHandle({
  node,
  zoom,
  visible,
  onResizingChange,
}: Props) {
  const resizeNode = useCanvasStore((s) => s.resizeNode);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const session = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
    width: number;
    height: number;
    lockByDefault: boolean;
    ratio: number;
  } | null>(null);

  function start(e: React.PointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    pushHistory();
    const box = nodeBox(node);
    const media =
      node.type === "image" ||
      node.type === "video" ||
      node.type === "panorama";
    session.current = {
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

      let width = Math.max(MIN_W, s.width + dx);
      let height = Math.max(MIN_H, s.height + dy);

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
        x: s.left,
        y: s.top,
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

  if (!visible) return null;

  const box = nodeBox(node);

  return (
    <div
      className="pointer-events-none absolute z-[40000]"
      style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
    >
      <button
        type="button"
        title="拖动缩放"
        aria-label="拖动缩放"
        className={cn(
          "pointer-events-auto absolute bottom-1.5 right-1.5 z-30 flex size-7 items-center justify-center rounded-md",
          "bg-black/45 text-white shadow-sm backdrop-blur-sm transition",
          "hover:bg-black/60 active:scale-[0.96]",
          "cursor-nwse-resize",
        )}
        onPointerDown={start}
      >
        <MoveDiagonal2 className="size-3.5 opacity-90" strokeWidth={2.25} />
      </button>
    </div>
  );
}
