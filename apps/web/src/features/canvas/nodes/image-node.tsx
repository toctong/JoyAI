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
import {
  MediaBusyState,
  MediaUploadLabel,
  mediaBusyLabel,
} from "../media-upload-label";
import { uploadFileIntoNode } from "../lib/upload-to-node";
import { cancelNodeJob } from "../lib/cancel-node-job";
import { isBusyStatus } from "../node-registry";
import { BatchStackChrome } from "../batch-stack-chrome";
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
  const [applying, setApplying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");
  const busy = applying || isBusyStatus(status);
  const canCancel =
    !applying && isBusyStatus(status) && Boolean(String(node.data.jobId ?? "").trim());
  const onCancel = canCancel
    ? () => void cancelNodeJob(node.id)
    : undefined;
  const title = nodeTitleLabel("image", node.data);
  const mediaW = Number(node.data.mediaWidth);
  const mediaH = Number(node.data.mediaHeight);
  const sizeMeta =
    Number.isFinite(mediaW) &&
    Number.isFinite(mediaH) &&
    mediaW > 0 &&
    mediaH > 0
      ? `${Math.round(mediaW)} × ${Math.round(mediaH)}`
      : undefined;

  async function applyEdit(dataUrl: string) {
    setApplying(true);
    try {
      const file = await dataUrlToFile(dataUrl, `edit-${node.id.slice(0, 8)}`);
      await uploadFileIntoNode(node.id, file);
      onEditingChange?.(false);
    } catch {
      /* node already shows failed state */
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
          width: node.width ?? 340,
          height: node.height ?? 240,
        }}
      >
        <NodeTitleChip
          nodeId={node.id}
          label={title}
          customTitle={String(node.data.title ?? "")}
          visible={framed || busy || selected || hovered}
          icon={<CanvasIconImage />}
          meta={sizeMeta}
          onDragPointerDown={onPointerDown}
        />
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-md",
            framed && "bg-black/5",
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              draggable={false}
              className={cn(
                "pointer-events-none h-full w-full select-none",
                node.data.freeResize ? "object-fill" : "object-contain",
              )}
              onDragStart={(event) => event.preventDefault()}
            />
          ) : busy ? (
            <MediaBusyState
              label={mediaBusyLabel(node.data)}
              onCancel={onCancel}
            />
          ) : (
            <MediaUploadLabel nodeId={node.id} kind="image">
              <CanvasIconImage />
            </MediaUploadLabel>
          )}
          {framed && busy ? (
            <MediaBusyState
              overlay
              label={mediaBusyLabel(node.data)}
              onCancel={onCancel}
            />
          ) : null}
          <NodeRuntimeBadge
            status={busy ? "idle" : status}
            error={error}
            busyLabel={mediaBusyLabel(node.data)}
            onRetry={
              status === "failed"
                ? () =>
                    updateNodeData(node.id, {
                      status: "idle",
                      error: "",
                      jobId: "",
                      busyLabel: "",
                    })
                : undefined
            }
          />
        </div>
        <BatchStackChrome node={node} visible={framed || selected || hovered} />
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
