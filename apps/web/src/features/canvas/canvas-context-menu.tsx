"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import {
  CanvasIconAudio,
  CanvasIconBrush,
  CanvasIconClose,
  CanvasIconCopy,
  CanvasIconDirector,
  CanvasIconFile,
  CanvasIconFolder,
  CanvasIconFrame,
  CanvasIconGrid,
  CanvasIconGroup,
  CanvasIconImage,
  CanvasIconInfo,
  CanvasIconLock,
  CanvasIconMaximize,
  CanvasIconPanorama,
  CanvasIconScissors,
  CanvasIconSparkles,
  CanvasIconText,
  CanvasIconTrash,
  CanvasIconUngroup,
  CanvasIconUnlock,
  CanvasIconUpload,
  CanvasIconVideo,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";
import { NODE_TYPE_LIST } from "./node-registry";
import { clampMenuPosition } from "./lib/clamp-menu";
import { cn } from "@/shared/lib/utils";
import type { ImageToolMode } from "./image-tool-dialog";

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
  panorama: "全景",
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

export type CreateMenuKind = "blank" | "connect";

export type CanvasCreateMenuState = {
  kind: CreateMenuKind;
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  sourceId?: string;
  preferredType?: CanvasNodeType;
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
  onClose: () => void;
};

export function CanvasCreateMenu({
  menu,
  viewportSize,
  onCreate,
  onUpload,
  onOpenAssets,
  onClose,
}: CreateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });

  const types = useMemo(() => {
    const list = CREATE_ORDER.map((type) => ({
      type,
      label: CREATE_LABELS[type],
    })).filter((item) => NODE_TYPE_LIST.some((n) => n.type === item.type));
    if (!menu.preferredType) return list;
    return [...list].sort((a, b) => {
      if (a.type === menu.preferredType) return -1;
      if (b.type === menu.preferredType) return 1;
      return 0;
    });
  }, [menu.preferredType]);

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
          {menu.kind === "connect" ? "连接到新节点" : "添加节点"}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 px-1.5">
        {types.map((item) => {
          const Icon = ICONS[item.type];
          const preferred = menu.preferredType === item.type;
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
        {menu.kind === "blank" && (onOpenAssets || onUpload) ? (
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
  onCaptureFrame?: (at: "first" | "last" | "current") => void;
  onExtractAudio?: () => void;
  onConvertType?: (to: "image" | "panorama") => void;
  onImageTool?: (mode: ImageToolMode) => void;
  onCopyPrompt?: () => void;
  onToggleFreeResize?: () => void;
  freeResize?: boolean;
  onInfo?: () => void;
  onTrimAudio?: () => void;
  onMaskEdit?: () => void;
  onClose: () => void;
};

export function CanvasNodeContextMenu({
  menu,
  viewportSize,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
  onCaptureFrame,
  onExtractAudio,
  onConvertType,
  onImageTool,
  onCopyPrompt,
  onToggleFreeResize,
  freeResize,
  onInfo,
  onTrimAudio,
  onMaskEdit,
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

  return (
    <div
      ref={ref}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute z-40 min-w-[168px] overflow-hidden rounded-xl py-1"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.nodeType === "video" && menu.hasMedia && onCaptureFrame ? (
        <>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onCaptureFrame("first")}
          >
            <CanvasIconFrame className="size-3.5 opacity-70" />
            截取首帧
          </button>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onCaptureFrame("current")}
          >
            <CanvasIconFrame className="size-3.5 opacity-70" />
            截取当前帧
          </button>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onCaptureFrame("last")}
          >
            <CanvasIconFrame className="size-3.5 opacity-70" />
            截取尾帧
          </button>
          {onExtractAudio ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onExtractAudio}
            >
              <CanvasIconAudio className="size-3.5 opacity-70" />
              抽取音轨
            </button>
          ) : null}
          {onTrimAudio ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onTrimAudio}
            >
              <CanvasIconScissors className="size-3.5 opacity-70" />
              截取音频
            </button>
          ) : null}
          {onToggleFreeResize ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onToggleFreeResize}
            >
              {freeResize ? (
                <CanvasIconUnlock className="size-3.5 opacity-70" />
              ) : (
                <CanvasIconLock className="size-3.5 opacity-70" />
              )}
              {freeResize ? "锁定比例" : "自由比例"}
            </button>
          ) : null}
          <div className="joy-canvas-chrome-sep my-1 h-px" />
        </>
      ) : null}
      {menu.nodeType === "audio" && menu.hasMedia && onTrimAudio ? (
        <>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={onTrimAudio}
          >
            <CanvasIconScissors className="size-3.5 opacity-70" />
            截取音频
          </button>
          <div className="joy-canvas-chrome-sep my-1 h-px" />
        </>
      ) : null}
      {menu.hasMedia &&
      (menu.nodeType === "image" || menu.nodeType === "panorama") &&
      onImageTool ? (
        <>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onImageTool("crop")}
          >
            <CanvasIconScissors className="size-3.5 opacity-70" />
            裁剪
          </button>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onImageTool("split")}
          >
            <CanvasIconGrid className="size-3.5 opacity-70" />
            切图
          </button>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onImageTool("upscale")}
          >
            <CanvasIconZoomIn className="size-3.5 opacity-70" />
            放大
          </button>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onImageTool("view")}
          >
            <CanvasIconMaximize className="size-3.5 opacity-70" />
            查看大图
          </button>
          {menu.nodeType === "image" && onMaskEdit ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onMaskEdit}
            >
              <CanvasIconBrush className="size-3.5 opacity-70" />
              局部涂抹
            </button>
          ) : null}
          {onCopyPrompt ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onCopyPrompt}
            >
              <CanvasIconFile className="size-3.5 opacity-70" />
              复制提示词
            </button>
          ) : null}
          {onToggleFreeResize ? (
            <button
              type="button"
              className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
              onClick={onToggleFreeResize}
            >
              {freeResize ? (
                <CanvasIconUnlock className="size-3.5 opacity-70" />
              ) : (
                <CanvasIconLock className="size-3.5 opacity-70" />
              )}
              {freeResize ? "锁定比例" : "自由比例"}
            </button>
          ) : null}
          <div className="joy-canvas-chrome-sep my-1 h-px" />
        </>
      ) : null}
      {menu.hasMedia &&
      menu.nodeType === "image" &&
      onConvertType ? (
        <>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onConvertType("panorama")}
          >
            <CanvasIconPanorama className="size-3.5 opacity-70" />
            转为全景
          </button>
          <div className="joy-canvas-chrome-sep my-1 h-px" />
        </>
      ) : null}
      {menu.hasMedia &&
      menu.nodeType === "panorama" &&
      onConvertType ? (
        <>
          <button
            type="button"
            className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
            onClick={() => onConvertType("image")}
          >
            <CanvasIconImage className="size-3.5 opacity-70" />
            转为普通图像
          </button>
          <div className="joy-canvas-chrome-sep my-1 h-px" />
        </>
      ) : null}
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
      {onInfo ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onInfo}
        >
          <CanvasIconInfo className="size-3.5 opacity-70" />
          节点信息
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
