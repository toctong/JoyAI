"use client";

import { CanvasIconClose } from "./icons/canvas-icons";
import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { nodeTitleLabel } from "./lib/node-chrome";
import {
  canvasRefKindOf,
  type CanvasRefKind,
} from "./lib/canvas-ref-candidates";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import { CanvasRefHoverPreview } from "./canvas-ref-preview";

type Props = {
  nodeId: string;
  /** When set, only show chips whose kind is allowed for this host. */
  allowedKinds?: readonly CanvasRefKind[];
};

/** Incoming media chips on a prompt node. Disconnect removes the edge only. */
export function NodeRefBar({ nodeId, allowedKinds }: Props) {
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
      (item): item is { edge: (typeof edges)[number]; node: CanvasNode } => {
        if (item.node == null) return false;
        const kind = canvasRefKindOf(item.node);
        if (!kind) return false;
        if (!allowedKinds?.length) return true;
        return allowedKinds.includes(kind);
      },
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
        const canPreview =
          node.type === "image" ||
          node.type === "panorama" ||
          node.type === "video";
        return (
          <CanvasRefHoverPreview
            key={edge.id}
            kind={node.type}
            url={url}
            className="group relative size-10 shrink-0"
            thumbClassName="size-10 overflow-hidden rounded-md border bg-muted"
            preview={canPreview}
          >
            <div
              className="relative size-full"
              title={nodeTitleLabel(node.type, node.data)}
            >
              <CanvasRefThumb kind={node.type} url={url} />
              <button
                type="button"
                title="断开参考"
                aria-label="断开参考"
                className="absolute right-0 top-0 z-[1] grid size-4 place-items-center rounded-bl bg-background/90 opacity-0 transition group-hover:opacity-100"
                onClick={() => {
                  pushHistory();
                  removeEdge(edge.id);
                }}
              >
                <CanvasIconClose className="size-3" />
              </button>
            </div>
          </CanvasRefHoverPreview>
        );
      })}
    </div>
  );
}
