"use client";

import {
  CanvasIconAudio,
  CanvasIconLoader,
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
import { isBusyStatus } from "../node-registry";
import { MediaUploadLabel } from "../media-upload-label";
import { CanvasAudioPlayer } from "../canvas-audio-player";
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
  const busy = isBusyStatus(status);

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        nodeChromeClass({
          selected,
          highlighted,
          pulsing,
          framed,
        }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 380,
        height: node.height ?? 200,
      }}
    >
      <NodeTitleChip
        nodeId={node.id}
        label={nodeTitleLabel("audio", node.data)}
        customTitle={String(node.data.title ?? "")}
        visible={framed || busy || selected || hovered}
        icon={<CanvasIconAudio />}
      />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-md",
          framed
            ? "overflow-hidden border border-zinc-300/90 bg-[#f4f4f5] shadow-[0_1px_2px_rgba(15,23,42,0.06),0_10px_28px_rgba(15,23,42,0.1)] dark:border-zinc-800/80 dark:bg-[#141416] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            : "border border-border bg-card p-2.5",
        )}
      >
        {framed ? (
          <CanvasAudioPlayer key={url} src={url} className="h-full" />
        ) : busy ? (
          <div className="flex h-full min-h-[120px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-muted/70 px-4 text-sm text-muted-foreground">
            <CanvasIconLoader className="size-4 shrink-0 animate-spin" />
            <span>分离中…</span>
          </div>
        ) : (
          <MediaUploadLabel nodeId={node.id} kind="audio">
            <CanvasIconAudio className="size-6 opacity-70" />
          </MediaUploadLabel>
        )}
        {busy && !framed ? null : (
          <NodeRuntimeBadge
            status={status}
            error={error}
            busyLabel="分离中…"
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
        )}
      </div>
    </div>
  );
}
