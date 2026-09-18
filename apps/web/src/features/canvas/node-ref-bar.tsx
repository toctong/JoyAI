"use client";

import {
  CanvasIconAudio,
  CanvasIconClose,
  CanvasIconFile,
  CanvasIconImage,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { nodeTitleLabel } from "./lib/node-chrome";

type Props = {
  nodeId: string;
};

/** Incoming media chips on a prompt node. Disconnect removes the edge only. */
export function NodeRefBar({ nodeId }: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const pushHistory = useCanvasStore((s) => s.pushHistory);

  const incoming = edges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => ({
      edge,
      node: nodes.find((item) => item.id === edge.source),
    }))
    .filter(
      (item): item is { edge: (typeof edges)[number]; node: CanvasNode } =>
        item.node != null &&
        (item.node.type === "image" ||
          item.node.type === "video" ||
          item.node.type === "panorama" ||
          item.node.type === "audio" ||
          item.node.type === "text"),
    );

  if (!incoming.length) return null;

  return (
    <div
      className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5"
      data-canvas-no-zoom
      onPointerDown={(event) => event.stopPropagation()}
    >
      {incoming.map(({ edge, node }) => {
        const url = String(node.data.url ?? "");
        const showThumb =
          (node.type === "image" || node.type === "panorama") &&
          url &&
          !url.startsWith("data:");
        return (
          <div
            key={edge.id}
            className="group relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted"
            title={nodeTitleLabel(node.type, node.data)}
          >
            {showThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none size-full select-none object-cover"
                onDragStart={(event) => event.preventDefault()}
              />
            ) : (
              <span className="grid size-full place-items-center text-muted-foreground">
                {node.type === "video" ? (
                  <CanvasIconVideo className="size-3.5" />
                ) : node.type === "audio" ? (
                  <CanvasIconAudio className="size-3.5" />
                ) : node.type === "image" || node.type === "panorama" ? (
                  <CanvasIconImage className="size-3.5" />
                ) : (
                  <CanvasIconFile className="size-3.5" />
                )}
              </span>
            )}
            <button
              type="button"
              title="断开参考"
              aria-label="断开参考"
              className="absolute right-0 top-0 grid size-4 place-items-center rounded-bl bg-background/90 opacity-0 transition group-hover:opacity-100"
              onClick={() => {
                pushHistory();
                removeEdge(edge.id);
              }}
            >
              <CanvasIconClose className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
