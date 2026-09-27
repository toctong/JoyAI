"use client";

import { useEffect, useRef, useState } from "react";
import {
  CanvasIconBlank,
  CanvasIconDots,
  CanvasIconFit,
  CanvasIconGrid,
  CanvasIconLink,
  CanvasIconMinimap,
  CanvasIconShortcuts,
  CanvasIconSnap,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";
import { CanvasZoomPanel } from "./canvas-zoom-panel";
import { useDockOverlayStore } from "./dock-overlay-store";
import {
  gridModeLabel,
  type CanvasEdgeVisibility,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import { cn } from "@/shared/lib/utils";

const ZOOM_BASE = { w: 260, h: 300 };
const GRID_BASE = { w: 220, h: 168 };
const MINIMAP_BASE = { w: 200, h: 132 };

type Props = {
  zoom: number;
  miniMapOpen: boolean;
  shortcutsOpen: boolean;
  edgeVisibility: CanvasEdgeVisibility;
  gridMode: CanvasGridMode;
  snapToGrid: boolean;
  onZoomChange: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onToggleMiniMap: () => void;
  onToggleShortcuts: () => void;
  onToggleEdgeVisibility: () => void;
  onGridModeChange: (mode: CanvasGridMode) => void;
  onToggleSnap: () => void;
  /** Called when zoom/grid takes over so board can hide minimap. */
  onDockOverlayChange?: (kind: "zoom" | "grid" | "minimap" | null) => void;
};

function ChipBtn({
  title,
  active,
  onClick,
  children,
  className,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "joy-canvas-chrome-btn grid size-8 place-items-center rounded-full transition",
        active && "is-active",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Bottom-left cluster — exclusive dock overlays; later panel is always larger.
 */
export function CanvasDock({
  zoom,
  miniMapOpen,
  shortcutsOpen,
  edgeVisibility,
  gridMode,
  snapToGrid,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onToggleMiniMap,
  onToggleShortcuts,
  onToggleEdgeVisibility,
  onGridModeChange,
  onToggleSnap,
  onDockOverlayChange,
}: Props) {
  const openOverlay = useDockOverlayStore((s) => s.open);
  const closeOverlay = useDockOverlayStore((s) => s.close);
  const active = useDockOverlayStore((s) => s.active);

  const [zoomPanelOpen, setZoomPanelOpen] = useState(false);
  const [gridPanelOpen, setGridPanelOpen] = useState(false);
  const [zoomSize, setZoomSize] = useState(ZOOM_BASE);
  const [gridSize, setGridSize] = useState(GRID_BASE);
  const gridRef = useRef<HTMLDivElement>(null);
  const focusEdges = edgeVisibility === "focus";
  const zoomPct = Math.round(zoom * 100);
  const GridIcon =
    gridMode === "lines"
      ? CanvasIconGrid
      : gridMode === "blank"
        ? CanvasIconBlank
        : CanvasIconDots;

  useEffect(() => {
    onDockOverlayChange?.(active?.kind ?? null);
  }, [active?.kind, onDockOverlayChange]);

  useEffect(() => {
    if (!gridPanelOpen) return;
    const close = (e: PointerEvent) => {
      if (gridRef.current?.contains(e.target as Node)) return;
      setGridPanelOpen(false);
      closeOverlay("grid");
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [gridPanelOpen, closeOverlay]);

  function showZoom() {
    setGridPanelOpen(false);
    closeOverlay("grid");
    const size = openOverlay("zoom", ZOOM_BASE.w, ZOOM_BASE.h);
    setZoomSize(size);
    setZoomPanelOpen(true);
  }

  function hideZoom() {
    setZoomPanelOpen(false);
    closeOverlay("zoom");
    if (miniMapOpen) {
      openOverlay("minimap", MINIMAP_BASE.w, MINIMAP_BASE.h);
    }
  }

  function toggleZoom() {
    if (zoomPanelOpen) hideZoom();
    else showZoom();
  }

  function showGrid() {
    setZoomPanelOpen(false);
    closeOverlay("zoom");
    const size = openOverlay("grid", GRID_BASE.w, GRID_BASE.h);
    setGridSize(size);
    setGridPanelOpen(true);
  }

  function hideGrid() {
    setGridPanelOpen(false);
    closeOverlay("grid");
    if (miniMapOpen) {
      openOverlay("minimap", MINIMAP_BASE.w, MINIMAP_BASE.h);
    }
  }

  function toggleGrid() {
    if (gridPanelOpen) hideGrid();
    else showGrid();
  }

  function handleToggleMiniMap() {
    setZoomPanelOpen(false);
    setGridPanelOpen(false);
    closeOverlay("zoom");
    closeOverlay("grid");
    if (!miniMapOpen) {
      openOverlay("minimap", MINIMAP_BASE.w, MINIMAP_BASE.h);
    } else {
      closeOverlay("minimap");
    }
    onToggleMiniMap();
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-auto absolute bottom-5 left-5 z-20"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative flex items-center gap-2">
        <CanvasZoomPanel
          open={zoomPanelOpen}
          zoom={zoom}
          width={zoomSize.w}
          height={zoomSize.h}
          onClose={hideZoom}
          onZoomChange={onZoomChange}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onFit={() => {
            onFit();
            hideZoom();
          }}
        />

        <div className="joy-canvas-dock-pill flex h-10 items-center gap-0.5 rounded-full px-1.5">
          <div className="relative" ref={gridRef}>
            <ChipBtn
              title="网格外观"
              active={gridPanelOpen}
              onClick={toggleGrid}
            >
              <GridIcon className="joy-canvas-tool-icon" />
            </ChipBtn>
            {gridPanelOpen ? (
              <div
                className="joy-canvas-chrome absolute bottom-[calc(100%+12px)] left-0 z-40 flex flex-col overflow-hidden rounded-2xl p-2 shadow-lg"
                style={{ width: gridSize.w, minHeight: gridSize.h }}
              >
                <div className="joy-canvas-chrome-muted mb-1.5 px-1 text-[11px] font-medium">
                  网格背景
                </div>
                <div className="mb-2 grid grid-cols-3 gap-1">
                  {(
                    [
                      ["dots", "点阵", CanvasIconDots],
                      ["lines", "线格", CanvasIconGrid],
                      ["blank", "无", CanvasIconBlank],
                    ] as const
                  ).map(([mode, label, Icon]) => (
                    <button
                      key={mode}
                      type="button"
                      className={cn(
                        "joy-canvas-chrome-btn flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px]",
                        gridMode === mode && "is-active",
                      )}
                      onClick={() => onGridModeChange(mode)}
                    >
                      <Icon className="joy-canvas-tool-icon" />
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={cn(
                    "joy-canvas-chrome-btn mt-auto flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs",
                    snapToGrid && "is-active",
                  )}
                  onClick={onToggleSnap}
                >
                  <CanvasIconSnap className="joy-canvas-tool-icon" />
                  网格吸附
                  <span className="joy-canvas-chrome-muted ml-auto text-[10px]">
                    {gridModeLabel(gridMode)}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <ChipBtn
            title={miniMapOpen ? "关闭小地图" : "打开小地图"}
            active={miniMapOpen && active?.kind === "minimap"}
            onClick={handleToggleMiniMap}
          >
            <CanvasIconMinimap className="joy-canvas-tool-icon" />
          </ChipBtn>

          <span className="joy-canvas-chrome-sep mx-0.5 h-3.5 w-px" aria-hidden />

          <button
            type="button"
            title="缩放与导航"
            aria-label={`缩放 ${zoomPct}%，打开缩放面板`}
            aria-expanded={zoomPanelOpen}
            onClick={toggleZoom}
            className={cn(
              "joy-canvas-chrome-btn inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] tabular-nums transition",
              zoomPanelOpen && "is-active",
            )}
          >
            <CanvasIconZoomIn className="joy-canvas-tool-icon opacity-80" />
            <span>{zoomPct}%</span>
          </button>
        </div>

        <ChipBtn
          title="适应内容 · 0"
          className="joy-canvas-dock-sat"
          onClick={() => {
            onFit();
            hideZoom();
            hideGrid();
          }}
        >
          <CanvasIconFit className="joy-canvas-tool-icon" />
        </ChipBtn>
        <ChipBtn
          title={
            focusEdges
              ? "隐藏连线：开（选中或悬停显示相关连线）"
              : "隐藏连线：关（显示全部）"
          }
          active={focusEdges}
          className="joy-canvas-dock-sat"
          onClick={onToggleEdgeVisibility}
        >
          <CanvasIconLink className="joy-canvas-tool-icon" />
        </ChipBtn>
        <ChipBtn
          title="快捷键 · ?"
          active={shortcutsOpen}
          className="joy-canvas-dock-sat"
          onClick={() => {
            hideZoom();
            hideGrid();
            onToggleShortcuts();
          }}
        >
          <CanvasIconShortcuts className="joy-canvas-tool-icon" />
        </ChipBtn>
      </div>
    </div>
  );
}

export { MINIMAP_BASE };
