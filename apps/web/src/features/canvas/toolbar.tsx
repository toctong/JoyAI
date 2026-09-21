"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import {
  CanvasIconBlank,
  CanvasIconDots,
  CanvasIconEraser,
  CanvasIconGrid,
  CanvasIconGroup,
  CanvasIconHand,
  CanvasIconPalette,
  CanvasIconPanorama,
  CanvasIconPrompt,
  CanvasIconRedo,
  CanvasIconSelect,
  CanvasIconSnap,
  CanvasIconTrash,
  CanvasIconUndo,
} from "./icons/canvas-icons";
import {
  gridModeLabel,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import { cn } from "@/shared/lib/utils";

type Props = {
  panMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  snapToGrid: boolean;
  gridMode: CanvasGridMode;
  selectedCount: number;
  onPanModeChange: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleSnap: () => void;
  onGridModeChange: (mode: CanvasGridMode) => void;
  onAddNode: (type: CanvasNodeType) => void;
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
  return <span className="joy-canvas-chrome-sep mx-1 h-5 w-px" aria-hidden />;
}

/** Bottom-center dock — select / history / extras (create tools live on left rail). */
export function CanvasToolbar({
  panMode,
  canUndo,
  canRedo,
  snapToGrid,
  gridMode,
  selectedCount,
  onPanModeChange,
  onUndo,
  onRedo,
  onToggleSnap,
  onGridModeChange,
  onAddNode,
  onAddGroup,
  onDeleteSelected,
  onClearCanvas,
}: Props) {
  const appearanceRef = useRef<HTMLDivElement>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  useEffect(() => {
    if (!appearanceOpen) return;
    const close = (e: PointerEvent) => {
      if (appearanceRef.current?.contains(e.target as Node)) return;
      setAppearanceOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [appearanceOpen]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
      <div
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome pointer-events-auto relative flex h-[52px] items-center gap-0.5 rounded-xl px-2"
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

        <ToolBtn title="全景" onClick={() => onAddNode("panorama")}>
          <CanvasIconPanorama className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="提示词" onClick={() => onAddNode("prompt")}>
          <CanvasIconPrompt className="joy-canvas-tool-icon" />
        </ToolBtn>
        <ToolBtn title="成组选中 ⌘G" onClick={onAddGroup}>
          <CanvasIconGroup className="joy-canvas-tool-icon" />
        </ToolBtn>

        <Sep />

        <div className="relative" ref={appearanceRef}>
          <ToolBtn
            title="外观 / 网格"
            active={appearanceOpen}
            onClick={() => setAppearanceOpen((v) => !v)}
          >
            <CanvasIconPalette className="joy-canvas-tool-icon" />
          </ToolBtn>
          {appearanceOpen ? (
            <div className="joy-canvas-chrome absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[220px] -translate-x-1/2 rounded-xl p-2">
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
                      "joy-canvas-chrome-btn flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px]",
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
                  "joy-canvas-chrome-btn flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs",
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
