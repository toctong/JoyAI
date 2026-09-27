"use client";

import {
  CanvasIconEraser,
  CanvasIconFolder,
  CanvasIconGroup,
  CanvasIconHand,
  CanvasIconRedo,
  CanvasIconSelect,
  CanvasIconTrash,
  CanvasIconUndo,
} from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

type Props = {
  panMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  selectedCount: number;
  onPanModeChange: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenAssets: () => void;
  onAddGroup: () => void;
  onDeleteSelected: () => void;
  onClearCanvas: () => void;
};

function ToolBtn({
  title,
  active,
  danger,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
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
        "joy-canvas-chrome-btn grid size-[length:var(--joy-canvas-tool-btn)] place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-35",
        active && "is-active",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="joy-canvas-chrome-sep mx-0.5 h-4 w-px" aria-hidden />;
}

/** Bottom-center dock — select / history / extras (create tools live on left rail). */
export function CanvasToolbar({
  panMode,
  canUndo,
  canRedo,
  selectedCount,
  onPanModeChange,
  onUndo,
  onRedo,
  onOpenAssets,
  onAddGroup,
  onDeleteSelected,
  onClearCanvas,
}: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
      <div
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome pointer-events-auto relative flex h-11 items-center gap-0 rounded-xl px-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ToolBtn
          title={panMode ? "选中模式" : "拖动模式"}
          active
          onClick={() => onPanModeChange(!panMode)}
        >
          {panMode ? (
            <CanvasIconHand className="joy-canvas-tool-icon" />
          ) : (
            <CanvasIconSelect className="joy-canvas-tool-icon" />
          )}
        </ToolBtn>
        <ToolBtn title="撤销 ⌘Z" disabled={!canUndo} onClick={onUndo}>
          <CanvasIconUndo className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="重做 ⇧⌘Z" disabled={!canRedo} onClick={onRedo}>
          <CanvasIconRedo className="joy-canvas-tool-icon" />
        </ToolBtn>

        <Sep />

        <ToolBtn title="资产" onClick={onOpenAssets}>
          <CanvasIconFolder className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="成组选中 ⌘G" onClick={onAddGroup}>
          <CanvasIconGroup className="joy-canvas-tool-icon" />
        </ToolBtn>

        <Sep />

        <ToolBtn
          title={selectedCount ? `删除选中 (${selectedCount})` : "删除选中"}
          danger
          disabled={!selectedCount}
          onClick={onDeleteSelected}
        >
          <CanvasIconTrash className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="清空画布" danger onClick={onClearCanvas}>
          <CanvasIconEraser className="joy-canvas-tool-icon" />
        </ToolBtn>
      </div>
    </div>
  );
}
