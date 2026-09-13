"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import type { Viewport } from "./store";

const MAP_W = 168;
const MAP_H = 112;
/** Simplify drawing when node count is high (Phase 6 P0). */
const SIMPLIFY_AT = 80;

const NODE_COLOR: Record<string, string> = {
  image: "#34d399",
  video: "#60a5fa",
  text: "#a1a1aa",
  prompt: "#c084fc",
};

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  viewportSize: { width: number; height: number };
  onViewportChange: (patch: Partial<Viewport>) => void;
};

export function CanvasMinimap({
  nodes,
  viewport,
  viewportSize,
  onViewportChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const { worldBounds, scale, offset } = useMemo(() => {
    if (!nodes.length) {
      return {
        worldBounds: { x: -400, y: -300, w: 800, h: 600 },
        scale: 0.14,
        offset: { x: 28, y: 14 },
      };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      const w = n.width ?? 240;
      const h = n.height ?? 180;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
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
  }, [nodes]);

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
      ref={ref}
      className="pointer-events-auto absolute bottom-20 left-3.5 z-20 overflow-hidden rounded-xl bg-[#141416f0] shadow-[0_8px_28px_rgba(0,0,0,0.4)] backdrop-blur-md"
      style={{ width: MAP_W, height: MAP_H }}
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
        <rect width={MAP_W} height={MAP_H} fill="#0c0c0e" />
        {drawNodes.map((n) => {
          const p = toMinimap(n.x, n.y);
          const w = Math.max((n.width ?? 240) * scale, 3);
          const h = Math.max((n.height ?? 180) * scale, 3);
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={w}
              height={h}
              rx={1.5}
              fill={NODE_COLOR[n.type] ?? "#71717a"}
              opacity={0.9}
            />
          );
        })}
        <rect
          x={viewRect.x}
          y={viewRect.y}
          width={viewRect.w}
          height={viewRect.h}
          fill="rgba(124,92,255,0.12)"
          stroke="rgba(167,139,250,0.85)"
          strokeWidth={1.25}
          rx={2}
        />
      </svg>
    </div>
  );
}

export const MINIMAP_STORAGE_KEY = "joyai.canvas.minimapOpen";

export function readMinimapOpenPreference(fallback = true) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(MINIMAP_STORAGE_KEY);
  if (raw === null) return fallback;
  return raw !== "0";
}

export function writeMinimapOpenPreference(open: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MINIMAP_STORAGE_KEY, open ? "1" : "0");
}
