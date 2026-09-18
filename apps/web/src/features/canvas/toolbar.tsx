"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import {
  CircleDot,
  Eraser,
  Grid2x2,
  Group,
  Hand,
  Image as ImageIcon,
  Magnet,
  MousePointer2,
  Palette,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  Video,
} from "lucide-react";
import { useCanvasStore } from "./store";
import {
  gridModeLabel,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import { apiUpload } from "@/shared/lib/api";
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
        "joy-canvas-chrome-btn grid size-8 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-35",
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

/** Bottom-center dock — aligned to infinite-canvas tool order (JoyAI theme). */
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
  const fileRef = useRef<HTMLInputElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  useEffect(() => {
    if (!appearanceOpen) return;
    const close = (e: PointerEvent) => {
      if (appearanceRef.current?.contains(e.target as Node)) return;
      setAppearanceOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [appearanceOpen]);

  async function onUpload(file: File) {
    pushHistory();
    const asset = await apiUpload<{ id: string; url: string; kind: string }>(
      "/upload",
      file,
    );
    const type: CanvasNodeType = asset.kind === "video" ? "video" : "image";
    const id = addNode(type);
    updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
    });
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center">
      <div
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome pointer-events-auto relative flex h-14 items-center gap-0.5 rounded-xl px-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ToolBtn
          title={panMode ? "选中模式" : "拖动模式"}
          active
          onClick={() => onPanModeChange(!panMode)}
        >
          {panMode ? (
            <Hand className="size-4" />
          ) : (
            <MousePointer2 className="size-4" />
          )}
        </ToolBtn>
        <ToolBtn title="撤销 ⌘Z" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="size-4" />
        </ToolBtn>
        <ToolBtn title="重做 ⇧⌘Z" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="size-4" />
        </ToolBtn>

        <Sep />

        <ToolBtn title="文本" onClick={() => onAddNode("text")}>
          <Type className="size-4" />
        </ToolBtn>
        <ToolBtn title="图像" onClick={() => onAddNode("image")}>
          <ImageIcon className="size-4" />
        </ToolBtn>
        <ToolBtn title="视频" onClick={() => onAddNode("video")}>
          <Video className="size-4" />
        </ToolBtn>
        <ToolBtn title="提示词" onClick={() => onAddNode("prompt")}>
          <Sparkles className="size-4" />
        </ToolBtn>
        <ToolBtn title="成组选中 ⌘G" onClick={onAddGroup}>
          <Group className="size-4" />
        </ToolBtn>
        <ToolBtn title="上传" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
        </ToolBtn>

        <Sep />

        <div className="relative" ref={appearanceRef}>
          <ToolBtn
            title="外观 / 网格"
            active={appearanceOpen}
            onClick={() => setAppearanceOpen((v) => !v)}
          >
            <Palette className="size-4" />
          </ToolBtn>
          {appearanceOpen ? (
            <div className="joy-canvas-chrome absolute bottom-[calc(100%+10px)] left-1/2 z-30 w-[220px] -translate-x-1/2 rounded-xl p-2 shadow-lg">
              <div className="joy-canvas-chrome-muted mb-1.5 px-1 text-[11px] font-medium">
                网格背景
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1">
                {(
                  [
                    ["dots", CircleDot, "点状"],
                    ["lines", Grid2x2, "线状"],
                    ["blank", Square, "空白"],
                  ] as const
                ).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    title={label}
                    className={cn(
                      "joy-canvas-chrome-btn flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px]",
                      gridMode === mode && "is-active",
                    )}
                    onClick={() => onGridModeChange(mode)}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={cn(
                  "joy-canvas-menu-item flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs",
                  snapToGrid && "is-preferred",
                )}
                onClick={onToggleSnap}
              >
                <Magnet className="size-3.5 opacity-70" />
                网格吸附 {snapToGrid ? "开" : "关"}
              </button>
              <button
                type="button"
                className="joy-canvas-menu-item mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs"
                onClick={() =>
                  onGridModeChange(
                    gridMode === "dots"
                      ? "lines"
                      : gridMode === "lines"
                        ? "blank"
                        : "dots",
                  )
                }
              >
                当前：{gridModeLabel(gridMode)} · 点此循环
              </button>
            </div>
          ) : null}
        </div>

        {selectedCount > 0 ? (
          <ToolBtn
            title={`删除选中 (${selectedCount})`}
            danger
            onClick={onDeleteSelected}
          >
            <Trash2 className="size-4" />
          </ToolBtn>
        ) : null}

        <Sep />

        <ToolBtn title="清空画布" danger onClick={onClearCanvas}>
          <Eraser className="size-4" />
        </ToolBtn>

        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
