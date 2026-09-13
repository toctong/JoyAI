"use client";

import {
  CanvasIconFit,
  CanvasIconHand,
  CanvasIconMinimap,
  CanvasIconRedo,
  CanvasIconSelect,
  CanvasIconShortcuts,
  CanvasIconSnap,
  CanvasIconUndo,
  CanvasIconZoomIn,
  CanvasIconZoomOut,
} from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

type Props = {
  zoom: number;
  panMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  miniMapOpen: boolean;
  snapToGrid: boolean;
  shortcutsOpen: boolean;
  onPanModeChange: (value: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleMiniMap: () => void;
  onToggleSnap: () => void;
  onToggleShortcuts: () => void;
};

function DockBtn({
  title,
  active,
  disabled,
  sm,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  sm?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35",
        sm ? "size-[30px]" : "size-9",
        active && "bg-white text-black hover:bg-white hover:text-black",
      )}
    >
      {children}
    </button>
  );
}

export function CanvasDock({
  zoom,
  panMode,
  canUndo,
  canRedo,
  miniMapOpen,
  snapToGrid,
  shortcutsOpen,
  onPanModeChange,
  onZoomIn,
  onZoomOut,
  onFit,
  onUndo,
  onRedo,
  onToggleMiniMap,
  onToggleSnap,
  onToggleShortcuts,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        className="pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-[18px] bg-[#1a1a1ecc] px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-[14px]"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DockBtn
          title="选中模式"
          active={!panMode}
          onClick={() => onPanModeChange(false)}
        >
          <CanvasIconSelect className="size-[18px]" />
        </DockBtn>
        <DockBtn
          title="拖动模式 Space"
          active={panMode}
          onClick={() => onPanModeChange(true)}
        >
          <CanvasIconHand className="size-[18px]" />
        </DockBtn>

        <span className="mx-1 h-[22px] w-px bg-white/10" aria-hidden />

        <DockBtn title="缩小 ⌘-" sm onClick={onZoomOut}>
          <CanvasIconZoomOut className="size-4" />
        </DockBtn>
        <span className="min-w-[44px] select-none text-center text-xs tabular-nums text-white/55">
          {Math.round(zoom * 100)}%
        </span>
        <DockBtn title="放大 ⌘=" sm onClick={onZoomIn}>
          <CanvasIconZoomIn className="size-4" />
        </DockBtn>
        <DockBtn title="适应屏幕 0" onClick={onFit}>
          <CanvasIconFit className="size-[17px]" />
        </DockBtn>

        <span className="mx-1 h-[22px] w-px bg-white/10" aria-hidden />

        <DockBtn
          title={snapToGrid ? "关闭网格吸附" : "开启网格吸附"}
          active={snapToGrid}
          onClick={onToggleSnap}
        >
          <CanvasIconSnap className="size-[17px]" />
        </DockBtn>
        <DockBtn
          title={miniMapOpen ? "关闭小地图" : "打开小地图"}
          active={miniMapOpen}
          onClick={onToggleMiniMap}
        >
          <CanvasIconMinimap className="size-[17px]" />
        </DockBtn>
        <DockBtn
          title="快捷键 ?"
          active={shortcutsOpen}
          onClick={onToggleShortcuts}
        >
          <CanvasIconShortcuts className="size-[17px]" />
        </DockBtn>
        <DockBtn title="撤销 ⌘Z" disabled={!canUndo} onClick={onUndo}>
          <CanvasIconUndo className="size-[17px]" />
        </DockBtn>
        <DockBtn title="重做 ⇧⌘Z" disabled={!canRedo} onClick={onRedo}>
          <CanvasIconRedo className="size-[17px]" />
        </DockBtn>
      </div>
    </div>
  );
}
