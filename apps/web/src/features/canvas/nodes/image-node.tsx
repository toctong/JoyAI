"use client";

import { useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { ImageEditor } from "../image-editor";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { NodeTitleChip } from "../node-title-chip";
import { dataUrlToFile } from "../lib/data-url-to-file";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { CanvasIconImage } from "../icons/canvas-icons";
import { apiUpload } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
  editing?: boolean;
  onEditingChange?: (open: boolean) => void;
};

export function ImageNode({
  node,
  onPointerDown,
  editing = false,
  onEditingChange,
}: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [applying, setApplying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");
  const title = nodeTitleLabel("image", node.data);

  async function applyEdit(dataUrl: string) {
    setApplying(true);
    updateNodeData(node.id, { status: "running", error: "" });
    try {
      pushHistory();
      const file = await dataUrlToFile(dataUrl, `edit-${node.id.slice(0, 8)}`);
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      updateNodeData(node.id, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        error: "",
      });
      onEditingChange?.(false);
    } catch (e) {
      updateNodeData(node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : "上传失败",
      });
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
          !framed && "overflow-hidden",
          nodeChromeClass({ selected, highlighted, pulsing, framed }),
        )}
        style={{
          left: node.x,
          top: node.y,
          width: node.width ?? 240,
          height: node.height ?? 180,
        }}
      >
        <NodeTitleChip label={title} visible={selected || hovered} />
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-md",
            framed && "bg-black/5",
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <CanvasIconImage className="size-7 opacity-70" />
              <span className="text-xs">空图像节点</span>
            </div>
          )}
          <NodeRuntimeBadge
            status={applying ? "running" : status}
            error={error}
          />
        </div>
      </div>
      {editing && url ? (
        <ImageEditor
          url={url}
          busy={applying}
          onClose={() => onEditingChange?.(false)}
          onApply={(nextUrl) => void applyEdit(nextUrl)}
        />
      ) : null}
    </>
  );
}
