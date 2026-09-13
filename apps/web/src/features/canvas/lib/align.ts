import type { CanvasNode } from "@joyai/shared";

export type AlignMode =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type DistributeMode = "horizontal" | "vertical";

function sizeOf(node: CanvasNode) {
  return {
    w: node.width ?? 240,
    h: node.height ?? (node.type === "text" ? 80 : 180),
  };
}

export function alignNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: AlignMode,
): CanvasNode[] {
  const idSet = new Set(ids);
  const targets = nodes.filter((n) => idSet.has(n.id));
  if (targets.length < 2) return nodes;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of targets) {
    const { w, h } = sizeOf(n);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return nodes.map((n) => {
    if (!idSet.has(n.id)) return n;
    const { w, h } = sizeOf(n);
    switch (mode) {
      case "left":
        return { ...n, x: minX };
      case "center-x":
        return { ...n, x: midX - w / 2 };
      case "right":
        return { ...n, x: maxX - w };
      case "top":
        return { ...n, y: minY };
      case "center-y":
        return { ...n, y: midY - h / 2 };
      case "bottom":
        return { ...n, y: maxY - h };
      default:
        return n;
    }
  });
}

export function distributeNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: DistributeMode,
): CanvasNode[] {
  const idSet = new Set(ids);
  const targets = nodes.filter((n) => idSet.has(n.id));
  if (targets.length < 3) return nodes;

  if (mode === "horizontal") {
    const sorted = [...targets].sort((a, b) => a.x - b.x);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const lastW = sizeOf(last).w;
    const span = last.x + lastW - first.x;
    const totalW = sorted.reduce((s, n) => s + sizeOf(n).w, 0);
    const gap = (span - totalW) / (sorted.length - 1);
    let cursor = first.x;
    const pos = new Map<string, number>();
    for (const n of sorted) {
      pos.set(n.id, cursor);
      cursor += sizeOf(n).w + gap;
    }
    return nodes.map((n) =>
      pos.has(n.id) ? { ...n, x: pos.get(n.id)! } : n,
    );
  }

  const sorted = [...targets].sort((a, b) => a.y - b.y);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const lastH = sizeOf(last).h;
  const span = last.y + lastH - first.y;
  const totalH = sorted.reduce((s, n) => s + sizeOf(n).h, 0);
  const gap = (span - totalH) / (sorted.length - 1);
  let cursor = first.y;
  const pos = new Map<string, number>();
  for (const n of sorted) {
    pos.set(n.id, cursor);
    cursor += sizeOf(n).h + gap;
  }
  return nodes.map((n) =>
    pos.has(n.id) ? { ...n, y: pos.get(n.id)! } : n,
  );
}

export function selectionBounds(nodes: CanvasNode[]) {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const { w, h } = sizeOf(n);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function groupIdOf(node: CanvasNode) {
  const g = node.data.groupId;
  return typeof g === "string" && g ? g : null;
}
