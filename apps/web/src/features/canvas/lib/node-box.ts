import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import { NODE_REGISTRY } from "../node-registry";

export function nodeBox(node: CanvasNode) {
  const entry = NODE_REGISTRY[node.type as CanvasNodeType];
  return {
    x: node.x,
    y: node.y,
    width: node.width ?? entry?.defaultWidth ?? 240,
    height: node.height ?? entry?.defaultHeight ?? 180,
  };
}

/** Topmost node under a world point. Selected nodes paint above (temp z-boost). */
export function hitNodeAt(
  nodes: CanvasNode[],
  x: number,
  y: number,
  selectedIds?: string[],
) {
  const selected = selectedIds?.length ? new Set(selectedIds) : null;
  const contains = (node: CanvasNode) => {
    const box = nodeBox(node);
    return (
      x >= box.x &&
      x <= box.x + box.width &&
      y >= box.y &&
      y <= box.y + box.height
    );
  };
  if (selected) {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i];
      if (!node || !selected.has(node.id)) continue;
      if (contains(node)) return node;
    }
  }
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!node) continue;
    if (contains(node)) return node;
  }
  return null;
}
