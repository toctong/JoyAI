"use client";

import {
  CanvasIconFit,
  CanvasIconLink,
  CanvasIconMinimap,
  CanvasIconShortcuts,
} from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";
import type { CanvasEdgeVisibility } from "./lib/canvas-prefs";

type Props = {
  zoom: number;
  miniMapOpen: boolean;
  shortcutsOpen: boolean;
  edgeVisibility: CanvasEdgeVisibility;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  onToggleMiniMap: () => void;
  onToggleShortcuts: () => void;
  onToggleEdgeVisibility: () => void;
};

function ChipBtn({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "joy-canvas-chrome-btn grid size-8 place-items-center rounded-lg transition",
        active && "is-active",
      )}
    >
      {children}
    </button>
  );
}

/** Bottom-left zoom cluster — file SVG icons (no lucide). */
export function CanvasDock({
  zoom,
  miniMapOpen,
  shortcutsOpen,
  edgeVisibility,
  onZoomChange,
  onFit,
  onToggleMiniMap,
  onToggleShortcuts,
  onToggleEdgeVisibility,
}: Props) {
  const focusEdges = edgeVisibility === "focus";
  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome pointer-events-auto absolute bottom-5 left-5 z-20 flex h-14 items-center gap-1 rounded-xl px-2"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ChipBtn
        title={miniMapOpen ? "关闭小地图" : "打开小地图"}
        active={miniMapOpen}
        onClick={onToggleMiniMap}
      >
        <CanvasIconMinimap className="size-4" />
      </ChipBtn>
      <ChipBtn title="适应内容 0" onClick={onFit}>
        <CanvasIconFit className="size-4" />
      </ChipBtn>
      <ChipBtn
        title={
          focusEdges
            ? "连线聚焦：已开启（点击节点只显示相关连线）"
            : "连线聚焦：关闭（显示全部连线）"
        }
        active={focusEdges}
        onClick={onToggleEdgeVisibility}
      >
        <CanvasIconLink className="size-4" />
      </ChipBtn>
      <input
        type="range"
        min={5}
        max={500}
        step={1}
        value={Math.round(zoom * 100)}
        title="缩放"
        aria-label="缩放"
        onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
        className="mx-1 h-1.5 w-24 cursor-pointer accent-foreground"
      />
      <span className="joy-canvas-chrome-muted w-10 text-center text-[11px] tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <ChipBtn
        title="快捷键 ?"
        active={shortcutsOpen}
        onClick={onToggleShortcuts}
      >
        <CanvasIconShortcuts className="size-4" />
      </ChipBtn>
    </div>
  );
}
