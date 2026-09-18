"use client";

import {
  CanvasIconFit,
  CanvasIconMinimap,
  CanvasIconShortcuts,
} from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

type Props = {
  zoom: number;
  miniMapOpen: boolean;
  shortcutsOpen: boolean;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
  onToggleMiniMap: () => void;
  onToggleShortcuts: () => void;
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
  onZoomChange,
  onFit,
  onToggleMiniMap,
  onToggleShortcuts,
}: Props) {
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
