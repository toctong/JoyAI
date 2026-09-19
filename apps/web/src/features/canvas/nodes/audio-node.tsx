"use client";

import {
  CanvasIconAudio,
} from "../icons/canvas-icons";
import { useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { MediaUploadLabel } from "../media-upload-label";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

export function AudioNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [hovered, setHovered] = useState(false);
  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        nodeChromeClass({ selected, highlighted, pulsing }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 320,
        height: node.height ?? 120,
      }}
    >
      <NodeTitleChip
        nodeId={node.id}
        label={nodeTitleLabel("audio", node.data)}
        customTitle={String(node.data.title ?? "")}
        visible={framed || selected || hovered}
        icon={<CanvasIconAudio />}
      />
      <div className="flex h-full flex-col justify-center gap-2 overflow-hidden rounded-md border border-border bg-card p-3">
        {framed ? (
          <audio
            src={url}
            controls
            draggable={false}
            className="w-full"
            data-canvas-no-zoom
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <MediaUploadLabel nodeId={node.id} kind="audio">
            <CanvasIconAudio className="size-6 opacity-70" />
          </MediaUploadLabel>
        )}
        <NodeRuntimeBadge
          status={status}
          error={error}
          onRetry={
            status === "failed"
              ? () =>
                  updateNodeData(node.id, {
                    status: "idle",
                    error: "",
                    jobId: "",
                  })
              : undefined
          }
        />
      </div>
    </div>
  );
}
