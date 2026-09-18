"use client";

import { useRef } from "react";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { apiUpload } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  flagPanoramaAspect,
  PANORAMA_NODE_SIZE,
} from "./lib/panorama-prompt";
import { frameNodeToMedia } from "./lib/fit-node-size";

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
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const inputRef = useRef<HTMLInputElement>(null);
  const draggedRef = useRef(false);

  async function onFile(file: File) {
    pushHistory();
    updateNodeData(nodeId, { status: "running", error: "" });
    try {
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      updateNodeData(nodeId, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        error: "",
        ...(kind === "panorama" ? { projection: "equirectangular" } : {}),
      });
      if (kind === "panorama") {
        updateNode(nodeId, {
          width: PANORAMA_NODE_SIZE.width,
          height: PANORAMA_NODE_SIZE.height,
        });
        flagPanoramaAspect(asset.url, (aspectHint) =>
          updateNodeData(nodeId, { aspectHint }),
        );
      } else if (kind === "image" || kind === "video") {
        void frameNodeToMedia(nodeId, file, kind);
      }
    } catch (e) {
      updateNodeData(nodeId, {
        status: "failed",
        error: e instanceof Error ? e.message : "上传失败",
      });
    }
  }

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
          if (file) void onFile(file);
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
