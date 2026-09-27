"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import { ChevronRight } from "lucide-react";
import {
  CanvasIconAudio,
  CanvasIconCopy,
  CanvasIconDirector,
  CanvasIconDownload,
  CanvasIconFolder,
  CanvasIconFolderPlus,
  CanvasIconGroup,
  CanvasIconImage,
  CanvasIconInfo,
  CanvasIconPanorama,
  CanvasIconSparkles,
  CanvasIconText,
  CanvasIconTrash,
  CanvasIconUngroup,
  CanvasIconUpload,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { NODE_TYPE_LIST } from "./node-registry";
import { clampMenuPosition } from "./lib/clamp-menu";
import { cn } from "@/shared/lib/utils";

const ICONS: Record<CanvasNodeType, typeof CanvasIconText> = {
  text: CanvasIconText,
  image: CanvasIconImage,
  video: CanvasIconVideo,
  prompt: CanvasIconSparkles,
  panorama: CanvasIconPanorama,
  audio: CanvasIconAudio,
  director: CanvasIconDirector,
};

/** Display labels aligned to product create menu (图片 not 图像). */
const CREATE_LABELS: Record<CanvasNodeType, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
  prompt: "提示词",
  panorama: "环视图",
  director: "导演台",
};

const CREATE_ORDER: CanvasNodeType[] = [
  "text",
  "image",
  "video",
  "audio",
  "prompt",
  "panorama",
  "director",
];

function shortcutMod() {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";
}

export type CreateMenuKind = "blank" | "connect";

export type CanvasCreateMenuState = {
  kind: CreateMenuKind;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  /** Single-source connect (legacy / one node). */
  sourceId?: string;
  /** Multi-select fan-out connect. */
  sourceIds?: string[];
  preferredType?: CanvasNodeType;
  /** When set, only these create types are listed (multi-connect). */
  allowedTypes?: CanvasNodeType[];
};

export type CanvasNodeMenuState = {
  kind: "node";
  x: number;
  y: number;
  nodeId: string;
  nodeType?: CanvasNodeType;
  hasMedia?: boolean;
  canGroup: boolean;
  canUngroup: boolean;
};

type CreateProps = {
  menu: CanvasCreateMenuState;
  viewportSize: { width: number; height: number };
  onCreate: (type: CanvasNodeType) => void;
  onUpload?: () => void;
  onOpenAssets?: () => void;
  onPaste?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onClose: () => void;
};

function CreateTypeList({
  types,
  preferredType,
  showSources,
  onCreate,
  onUpload,
  onOpenAssets,
}: {
  types: { type: CanvasNodeType; label: string }[];
  preferredType?: CanvasNodeType;
  showSources?: boolean;
  onCreate: (type: CanvasNodeType) => void;
  onUpload?: () => void;
  onOpenAssets?: () => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-1.5">
      {types.map((item) => {
        const Icon = ICONS[item.type];
        const preferred = preferredType === item.type;
        return (
          <button
            key={item.type}
            type="button"
            className={cn(
              "joy-canvas-menu-item flex h-9 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[13px] font-medium transition",
              preferred && "is-preferred",
            )}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              if (e.detail > 1) return;
              onCreate(item.type);
            }}
          >
            <Icon className="size-4 shrink-0 opacity-90" />
            <span className="min-w-0 truncate">{item.label}</span>
          </button>
        );
      })}
      {showSources && (onOpenAssets || onUpload) ? (
        <>
          <div className="joy-canvas-chrome-sep mx-2 my-1.5 h-px" />
          {onOpenAssets ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex h-9 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[13px] font-medium transition"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                if (e.detail > 1) return;
                onOpenAssets();
              }}
            >
              <CanvasIconFolder className="size-4 shrink-0 opacity-90" />
              <span className="min-w-0 truncate">从资产库添加</span>
            </button>
          ) : null}
          {onUpload ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex h-9 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[13px] font-medium transition"
              onPointerDown={(e) => e.preventDefault()}
              onClick={(e) => {
                if (e.detail > 1) return;
                onUpload();
              }}
            >
              <CanvasIconUpload className="size-4 shrink-0 opacity-90" />
              <span className="min-w-0 truncate">本地上传</span>
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function CanvasCreateMenu({
  menu,
  viewportSize,
  onCreate,
  onUpload,
  onOpenAssets,
  onPaste,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onClose,
}: CreateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const [createOpen, setCreateOpen] = useState(false);
  const mod = shortcutMod();

  const types = useMemo(() => {
    const list = CREATE_ORDER.map((type) => ({
      type,
      label: CREATE_LABELS[type],
    }))
      .filter((item) => NODE_TYPE_LIST.some((n) => n.type === item.type))
      .filter(
        (item) =>
          !menu.allowedTypes?.length ||
          menu.allowedTypes.includes(item.type),
      );
    if (!menu.preferredType) return list;
    return [...list].sort((a, b) => {
      if (a.type === menu.preferredType) return -1;
      if (b.type === menu.preferredType) return 1;
      return 0;
    });
  }, [menu.allowedTypes, menu.preferredType]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(clampMenuPosition(menu.x, menu.y, rect, viewportSize));
  }, [menu.x, menu.y, viewportSize, createOpen, menu.kind]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [onClose]);

  if (menu.kind === "connect") {
    return (
      <div
        ref={ref}
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="joy-canvas-chrome absolute z-40 w-[200px] overflow-hidden rounded-2xl py-2"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 pb-1.5 pt-0.5">
          <span className="joy-canvas-chrome-muted text-[12px] font-medium">
            {menu.sourceIds && menu.sourceIds.length > 1
              ? `批量连接到新节点（${menu.sourceIds.length}）`
              : "连接到新节点"}
          </span>
        </div>
        <CreateTypeList
          types={types}
          preferredType={menu.preferredType}
          onCreate={onCreate}
        />
      </div>
    );
  }

  return (
    <div
      ref={ref}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="absolute z-40 flex items-start"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseLeave={() => setCreateOpen(false)}
    >
      <div className="joy-canvas-chrome min-w-[200px] overflow-hidden rounded-2xl py-1.5">
        <button
          type="button"
          className={cn(
            "joy-canvas-menu-item flex h-9 w-full items-center justify-between gap-3 px-3.5 text-left text-[13px] font-medium transition",
            createOpen && "is-preferred",
          )}
          onPointerDown={(e) => e.preventDefault()}
          onMouseEnter={() => setCreateOpen(true)}
          onFocus={() => setCreateOpen(true)}
        >
          <span>新建节点</span>
          <ChevronRight
            className="size-3.5 shrink-0 opacity-55"
            aria-hidden
          />
        </button>

        <div className="joy-canvas-chrome-sep mx-3 my-1.5 h-px" />

        <button
          type="button"
          className="joy-canvas-menu-item flex h-9 w-full items-center justify-between gap-4 px-3.5 text-left text-[13px] font-medium transition"
          onPointerDown={(e) => e.preventDefault()}
          onMouseEnter={() => setCreateOpen(false)}
          onClick={(e) => {
            if (e.detail > 1) return;
            onPaste?.();
          }}
        >
          <span>粘贴</span>
          <span className="joy-canvas-chrome-muted text-[12px] font-normal tabular-nums">
            {mod}+V
          </span>
        </button>
        <button
          type="button"
          disabled={!canRedo}
          className="joy-canvas-menu-item flex h-9 w-full items-center justify-between gap-4 px-3.5 text-left text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-40"
          onPointerDown={(e) => e.preventDefault()}
          onMouseEnter={() => setCreateOpen(false)}
          onClick={(e) => {
            if (e.detail > 1 || !canRedo) return;
            onRedo?.();
          }}
        >
          <span>重做</span>
          <span className="joy-canvas-chrome-muted text-[12px] font-normal tabular-nums">
            {mod}+Shift+Z
          </span>
        </button>
        <button
          type="button"
          disabled={!canUndo}
          className="joy-canvas-menu-item flex h-9 w-full items-center justify-between gap-4 px-3.5 text-left text-[13px] font-medium transition disabled:pointer-events-none disabled:opacity-40"
          onPointerDown={(e) => e.preventDefault()}
          onMouseEnter={() => setCreateOpen(false)}
          onClick={(e) => {
            if (e.detail > 1 || !canUndo) return;
            onUndo?.();
          }}
        >
          <span>撤销</span>
          <span className="joy-canvas-chrome-muted text-[12px] font-normal tabular-nums">
            {mod}+Z
          </span>
        </button>
      </div>

      {createOpen ? (
        <div
          className="joy-canvas-chrome ml-1 w-[200px] overflow-hidden rounded-2xl py-2"
          onMouseEnter={() => setCreateOpen(true)}
        >
          <div className="px-3.5 pb-1.5 pt-0.5">
            <span className="joy-canvas-chrome-muted text-[12px] font-medium">
              添加节点
            </span>
          </div>
          <CreateTypeList
            types={types}
            preferredType={menu.preferredType}
            showSources
            onCreate={onCreate}
            onUpload={onUpload}
            onOpenAssets={onOpenAssets}
          />
        </div>
      ) : null}
    </div>
  );
}

type NodeMenuProps = {
  menu: CanvasNodeMenuState;
  viewportSize: { width: number; height: number };
  onDuplicate: () => void;
  onDelete: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  onSaveAsset?: () => void;
  onDownload?: () => void;
  onInfo?: () => void;
  onClose: () => void;
};

/**
 * Node right-click — manage actions (存素材 / 下载 / 信息 / 复制 / 删除).
 * Image / video creative tools live on the float toolbar.
 */
export function CanvasNodeContextMenu({
  menu,
  viewportSize,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onSaveAsset,
  onDownload,
  onInfo,
  onClose,
}: NodeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos(clampMenuPosition(menu.x, menu.y, rect, viewportSize));
  }, [menu.x, menu.y, viewportSize]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [onClose]);

  const hasManageSep =
    Boolean(onSaveAsset || onDownload || onInfo) &&
    Boolean(
      (menu.canGroup && onGroup) ||
        (menu.canUngroup && onUngroup),
    );

  return (
    <div
      ref={ref}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute z-40 min-w-[168px] overflow-hidden rounded-xl py-1"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.canGroup && onGroup ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onGroup}
        >
          <CanvasIconGroup className="size-3.5 opacity-70" />
          成组
        </button>
      ) : null}
      {menu.canUngroup && onUngroup ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onUngroup}
        >
          <CanvasIconUngroup className="size-3.5 opacity-70" />
          解组
        </button>
      ) : null}
      {hasManageSep ? (
        <div className="joy-canvas-chrome-sep my-1 h-px" />
      ) : null}
      {onSaveAsset ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onSaveAsset}
        >
          <CanvasIconFolderPlus className="size-3.5 opacity-70" />
          存素材
        </button>
      ) : null}
      {onDownload ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onDownload}
        >
          <CanvasIconDownload className="size-3.5 opacity-70" />
          下载
        </button>
      ) : null}
      {onInfo ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onInfo}
        >
          <CanvasIconInfo className="size-3.5 opacity-70" />
          信息
        </button>
      ) : null}
      <button
        type="button"
        className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
        onClick={onDuplicate}
      >
        <CanvasIconCopy className="size-3.5 opacity-70" />
        复制
      </button>
      <button
        type="button"
        className="joy-canvas-menu-item is-danger flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
        onClick={onDelete}
      >
        <CanvasIconTrash className="size-3.5 opacity-70" />
        删除
      </button>
    </div>
  );
}
