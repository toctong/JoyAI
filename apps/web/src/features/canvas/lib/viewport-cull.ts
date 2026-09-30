import type { CanvasNode } from "@joyai/shared";
import { nodeBox } from "./node-box";

export type WorldRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Screen viewport → world AABB. `overscanPx` expands in screen pixels. */
export function worldViewRect(
  viewport: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
  overscanPx = 240,
): WorldRect {
  const z = Math.max(viewport.zoom, 0.001);
  const pad = overscanPx / z;
  return {
    left: -viewport.x / z - pad,
    top: -viewport.y / z - pad,
    right: (size.width - viewport.x) / z + pad,
    bottom: (size.height - viewport.y) / z + pad,
  };
}

export function boxInWorldRect(
  box: { x: number; y: number; width: number; height: number },
  rect: WorldRect,
) {
  return (
    box.x + box.width >= rect.left &&
    box.x <= rect.right &&
    box.y + box.height >= rect.top &&
    box.y <= rect.bottom
  );
}

/**
 * Node ids that should stay mounted.
 * Small boards skip culling; pinned ids (selection / hover / editors) always keep.
 */
export function visibleCanvasNodeIds(
  nodes: CanvasNode[],
  viewport: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
  pinned: ReadonlySet<string>,
  opts?: { minNodes?: number; overscanPx?: number },
): Set<string> {
  const minNodes = opts?.minNodes ?? 24;
  if (nodes.length <= minNodes) {
    return new Set(nodes.map((n) => n.id));
  }
  const rect = worldViewRect(viewport, size, opts?.overscanPx ?? 240);
  const out = new Set<string>();
  for (const node of nodes) {
    if (pinned.has(node.id) || boxInWorldRect(nodeBox(node), rect)) {
      out.add(node.id);
    }
  }
  return out;
}
