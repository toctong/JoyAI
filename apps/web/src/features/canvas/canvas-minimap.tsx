"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import type { Viewport } from "./store";
import { nodeBox } from "./lib/node-box";
import { CanvasIconMaximize } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

const DEFAULT_MAP_W = 200;
const DEFAULT_MAP_H = 132;
/** Simplify drawing when node count is high (Phase 6 P0). */
const SIMPLIFY_AT = 80;

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  viewportSize: { width: number; height: number };
  onViewportChange: (patch: Partial<Viewport>) => void;
  width?: number;
  height?: number;
  onClose?: () => void;
  onFit?: () => void;
};

export function CanvasMinimap({
  nodes,
  viewport,
  viewportSize,
  onViewportChange,
  width = DEFAULT_MAP_W,
  height = DEFAULT_MAP_H,
  onClose,
  onFit,
}: Props) {
  const MAP_W = width;
  const MAP_H = height;
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const { worldBounds, scale, offset } = useMemo(() => {
    if (!nodes.length) {
      return {
        worldBounds: { x: -400, y: -300, w: 800, h: 600 },
        scale: Math.min(MAP_W / 800, MAP_H / 600),
        offset: { x: 0, y: 0 },
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const box = nodeBox(n);
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    const pad = 320;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);
    const nextScale = Math.min(MAP_W / bw, MAP_H / bh);
    return {
      worldBounds: { x: minX, y: minY, w: bw, h: bh },
      scale: nextScale,
      offset: {
        x: (MAP_W - bw * nextScale) / 2,
        y: (MAP_H - bh * nextScale) / 2,
      },
    };
  }, [nodes, MAP_W, MAP_H]);

  const toMinimap = useCallback(
    (wx: number, wy: number) => ({
      x: (wx - worldBounds.x) * scale + offset.x,
      y: (wy - worldBounds.y) * scale + offset.y,
    }),
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
  );

  const toWorld = useCallback(
    (mx: number, my: number) => ({
      x: (mx - offset.x) / scale + worldBounds.x,
      y: (my - offset.y) / scale + worldBounds.y,
    }),
    [offset.x, offset.y, scale, worldBounds.x, worldBounds.y],
  );

  const viewRect = useMemo(() => {
    const vx = -viewport.x / viewport.zoom;
    const vy = -viewport.y / viewport.zoom;
    const vw = viewportSize.width / viewport.zoom;
    const vh = viewportSize.height / viewport.zoom;
    const p1 = toMinimap(vx, vy);
    const p2 = toMinimap(vx + vw, vy + vh);
    return {
      x: p1.x,
      y: p1.y,
      w: Math.max(p2.x - p1.x, 6),
      h: Math.max(p2.y - p1.y, 6),
    };
  }, [toMinimap, viewport, viewportSize]);

  function jumpTo(e: React.PointerEvent) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const world = toWorld(e.clientX - box.left, e.clientY - box.top);
    onViewportChange({
      x: viewportSize.width / 2 - world.x * viewport.zoom,
      y: viewportSize.height / 2 - world.y * viewport.zoom,
    });
  }

  const drawNodes =
    nodes.length > SIMPLIFY_AT
      ? nodes.filter((_, i) => i % 2 === 0)
      : nodes;

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-minimap group pointer-events-auto absolute bottom-[4.5rem] left-5 z-30 overflow-hidden rounded-2xl"
      style={{ width: MAP_W, height: MAP_H }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        ref={ref}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        title="拖拽跳转视口"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          jumpTo(e);
        }}
        onPointerMove={(e) => {
          if (dragging) jumpTo(e);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        <svg width={MAP_W} height={MAP_H} className="block">
          <rect width={MAP_W} height={MAP_H} className="fill-[var(--popover)]" />
          {drawNodes.map((n) => {
            const box = nodeBox(n);
            const p = toMinimap(box.x, box.y);
            const w = Math.max(box.width * scale, 3);
            const h = Math.max(box.height * scale, 3);
            return (
              <rect
                key={n.id}
                x={p.x}
                y={p.y}
                width={w}
                height={h}
                rx={2}
                className="fill-foreground/25"
              />
            );
          })}
          <rect
            x={viewRect.x}
            y={viewRect.y}
            width={viewRect.w}
            height={viewRect.h}
            fill="color-mix(in oklab, var(--foreground) 8%, transparent)"
            stroke="color-mix(in oklab, var(--foreground) 75%, transparent)"
            strokeWidth={1.25}
            rx={2}
          />
        </svg>
      </div>

      {onFit ? (
        <button
          type="button"
          title="适应内容"
          aria-label="适应内容"
          className={cn(
            "absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md",
            "bg-black/35 text-white/85 opacity-0 backdrop-blur-sm transition",
            "hover:bg-black/50 hover:text-white group-hover:opacity-100",
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onFit();
          }}
        >
          <CanvasIconMaximize className="size-3.5" />
        </button>
      ) : null}

      {onClose ? (
        <button
          type="button"
          className={cn(
            "absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white",
            "opacity-0 backdrop-blur-sm transition group-hover:opacity-100",
            "hover:bg-black/70",
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          隐藏小地图
        </button>
      ) : null}
    </div>
  );
}

export const MINIMAP_STORAGE_KEY = "joyai.canvas.minimapOpen";

export function readMinimapOpenPreference(fallback = true) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(MINIMAP_STORAGE_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeMinimapOpenPreference(open: boolean) {
  try {
    window.localStorage.setItem(MINIMAP_STORAGE_KEY, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}
