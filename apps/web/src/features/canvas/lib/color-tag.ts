import type { CanvasNode } from "@joyai/shared";

export const COLOR_TAGS = [
  { id: "cyan", label: "青色", swatch: "#22d3ee" },
  { id: "blue", label: "蓝色", swatch: "#818cf8" },
  { id: "purple", label: "紫色", swatch: "#a855f7" },
  { id: "orange", label: "橙色", swatch: "#fb923c" },
  { id: "yellow", label: "黄色", swatch: "#facc15" },
] as const;

export type ColorTagId = (typeof COLOR_TAGS)[number]["id"];

const TAG_IDS = new Set<string>(COLOR_TAGS.map((item) => item.id));

export function isColorTagId(value: unknown): value is ColorTagId {
  return typeof value === "string" && TAG_IDS.has(value);
}

export function colorTagOf(node: CanvasNode): ColorTagId | null {
  const raw = node.data.colorTag;
  return isColorTagId(raw) ? raw : null;
}

export function colorTagMeta(id: ColorTagId) {
  return COLOR_TAGS.find((item) => item.id === id)!;
}

export function nodesWithColorTag(nodes: CanvasNode[], id: ColorTagId) {
  return nodes.filter((node) => colorTagOf(node) === id);
}

/** Colors currently used on the board, with member counts. */
export function usedColorTagCounts(nodes: CanvasNode[]) {
  const counts = new Map<ColorTagId, number>();
  for (const node of nodes) {
    const tag = colorTagOf(node);
    if (!tag) continue;
    counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return COLOR_TAGS.map((item) => ({
    ...item,
    count: counts.get(item.id) ?? 0,
  })).filter((item) => item.count > 0);
}
