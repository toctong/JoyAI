"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import {
  Copy,
  Group,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  Type,
  Ungroup,
  Upload,
  Video,
  X,
} from "lucide-react";
import { NODE_TYPE_LIST } from "./node-registry";
import { clampMenuPosition } from "./lib/clamp-menu";
import { cn } from "@/shared/lib/utils";

const ICONS: Record<CanvasNodeType, typeof Type> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  prompt: Sparkles,
};

const DESCRIPTIONS: Partial<Record<CanvasNodeType, string>> = {
  text: "便签与文案",
  image: "图片或生成结果",
  video: "视频素材",
  prompt: "提示词并触发生成",
};

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
  canGroup: boolean;
  canUngroup: boolean;
};

type CreateProps = {
  menu: CanvasCreateMenuState;
  viewportSize: { width: number; height: number };
  onCreate: (type: CanvasNodeType) => void;
  onUpload?: () => void;
  onClose: () => void;
};

export function CanvasCreateMenu({
  menu,
  viewportSize,
  onCreate,
  onUpload,
  onClose,
}: CreateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  const types = [...NODE_TYPE_LIST].sort((a, b) => {
    if (!menu.preferredType) return 0;
    if (a.type === menu.preferredType) return -1;
    if (b.type === menu.preferredType) return 1;
    return 0;
  });

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
      className="joy-canvas-chrome absolute z-40 w-[280px] overflow-hidden rounded-xl p-2"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between px-2">
        <span className="joy-canvas-chrome-muted text-xs font-medium">
          {menu.kind === "connect" ? "连接到新节点" : "添加节点"}
        </span>
        <button
          type="button"
          className="joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg"
          aria-label="关闭"
          onClick={onClose}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-0.5">
        {types.map((item) => {
          const Icon = ICONS[item.type];
          const preferred = menu.preferredType === item.type;
          const desc = DESCRIPTIONS[item.type];
          return (
            <button
              key={item.type}
              type="button"
              className={cn(
                "joy-canvas-menu-item flex h-14 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm transition",
                preferred && "is-preferred",
              )}
              onClick={() => onCreate(item.type)}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium leading-5">
                  {item.label}
                  {preferred ? (
                    <span className="rounded bg-ring/15 px-1.5 py-0.5 text-[10px] text-foreground">
                      推荐
                    </span>
                  ) : null}
                </span>
                {desc ? (
                  <span className="joy-canvas-chrome-muted mt-0.5 block truncate text-[11px]">
                    {desc}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        {menu.kind === "blank" && onUpload ? (
          <>
            <div className="joy-canvas-chrome-sep my-1 h-px" />
            <button
              type="button"
              className="joy-canvas-menu-item flex h-14 w-full items-center gap-3 rounded-xl px-2.5 text-left text-sm transition"
              onClick={onUpload}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <Upload className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-5">上传文件</span>
                <span className="joy-canvas-chrome-muted mt-0.5 block text-[11px]">
                  图片或视频
                </span>
              </span>
            </button>
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
  onClose: () => void;
};

export function CanvasNodeContextMenu({
  menu,
  viewportSize,
  onDuplicate,
  onDelete,
  onGroup,
  onUngroup,
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
      {menu.canGroup && onGroup ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onGroup}
        >
          <Group className="size-3.5 opacity-70" />
          成组
        </button>
      ) : null}
      {menu.canUngroup && onUngroup ? (
        <button
          type="button"
          className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
          onClick={onUngroup}
        >
          <Ungroup className="size-3.5 opacity-70" />
          解组
        </button>
      ) : null}
      <button
        type="button"
        className="joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
        onClick={onDuplicate}
      >
        <Copy className="size-3.5 opacity-70" />
        复制
      </button>
      <button
        type="button"
        className="joy-canvas-menu-item is-danger flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5 opacity-70" />
        删除
      </button>
    </div>
  );
}
