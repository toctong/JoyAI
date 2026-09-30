import type { CanvasEdge, CanvasNode } from "@joyai/shared";
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

/** Keep edge if either endpoint is in view, or the edge AABB intersects the view. */
export function edgeIntersectsWorldRect(
  source: CanvasNode,
  target: CanvasNode,
  rect: WorldRect,
) {
  const a = nodeBox(source);
  const b = nodeBox(target);
  if (boxInWorldRect(a, rect) || boxInWorldRect(b, rect)) return true;
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return boxInWorldRect(
    { x: left, y: top, width: right - left, height: bottom - top },
    rect,
  );
}

export function filterEdgesInViewport(
  edges: CanvasEdge[],
  byId: Map<string, CanvasNode>,
  viewport: { x: number; y: number; zoom: number },
  size: { width: number; height: number },
  pinnedEdgeIds: ReadonlySet<string>,
  opts?: { minEdges?: number; overscanPx?: number },
): CanvasEdge[] {
  const minEdges = opts?.minEdges ?? 40;
  if (edges.length <= minEdges) return edges;
  const rect = worldViewRect(viewport, size, opts?.overscanPx ?? 320);
  return edges.filter((edge) => {
    if (pinnedEdgeIds.has(edge.id)) return true;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) return false;
    return edgeIntersectsWorldRect(source, target, rect);
  });
}
