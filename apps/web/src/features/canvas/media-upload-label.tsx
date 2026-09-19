"use client";

import { useRef } from "react";
import type { CanvasNode } from "@joyai/shared";
import { cn } from "@/shared/lib/utils";
import { uploadFileIntoNode } from "./lib/upload-to-node";

type Kind = "image" | "video" | "panorama" | "audio";

const ACCEPT: Record<Kind, string> = {
  image: "image/*",
  video: "video/*",
  panorama: "image/*",
  audio: "audio/*",
};

const LABEL: Record<Kind, string> = {
  image: "上传图片",
  video: "上传视频",
  panorama: "上传全景 · 2:1",
  audio: "上传音频",
};

const DRAG_CLICK_PX = 4;

type Props = {
  nodeId: string;
  kind: Kind;
  className?: string;
  children: React.ReactNode;
};

/** Centered loading surface while a media node is uploading or separating. */
export function MediaBusyState({
  label = "上传中…",
  className,
  overlay = false,
}: {
  label?: string;
  className?: string;
  /** Cover existing media during replace uploads. */
  overlay?: boolean;
}) {
  return (
    <div
      className={cn(
        "joy-media-busy",
        overlay && "is-overlay absolute inset-0 z-[2]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="joy-media-busy-sheen" aria-hidden />
      <div className="joy-media-busy-core">
        <span className="joy-media-busy-ring" aria-hidden>
          <svg viewBox="0 0 36 36">
            <circle className="track" cx="18" cy="18" r="14" />
            <circle className="arc" cx="18" cy="18" r="14" />
          </svg>
        </span>
        <span className="joy-media-busy-label">{label}</span>
        <span className="joy-media-busy-bar" aria-hidden>
          <span />
        </span>
      </div>
    </div>
  );
}

export function mediaBusyLabel(
  data: Record<string, unknown>,
  fallback = "生成中…",
) {
  const label = String(data.busyLabel ?? "").trim();
  return label || fallback;
}

/**
 * Empty-state upload. Pointerdown bubbles so the node can be dragged.
 * The file picker opens only on a click that did not move.
 */
export function MediaUploadLabel({
  nodeId,
  kind,
  className,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const draggedRef = useRef(false);

  return (
    <div
      className={cn(
        "flex h-full w-full cursor-inherit flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const startX = event.clientX;
        const startY = event.clientY;
        draggedRef.current = false;
        const onMove = (move: PointerEvent) => {
          if (Math.hypot(move.clientX - startX, move.clientY - startY) > DRAG_CLICK_PX) {
            draggedRef.current = true;
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      }}
      onClick={(event) => {
        if (draggedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        inputRef.current?.click();
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {children}
      <span className="pointer-events-none select-none text-xs">{LABEL[kind]}</span>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFileIntoNode(nodeId, file).catch(() => undefined);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function mediaAcceptFor(node: CanvasNode) {
  if (node.type === "video") return "video/*";
  if (node.type === "audio") return "audio/*";
  return "image/*";
}
