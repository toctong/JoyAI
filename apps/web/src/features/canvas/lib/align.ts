import type { CanvasNode } from "@joyai/shared";
import { nodeBox } from "./node-box";

export type AlignMode =
  | "left"
  | "center-x"
  | "right"
  | "top"
  | "center-y"
  | "bottom";

export type DistributeMode = "horizontal" | "vertical";

function sizeOf(node: CanvasNode) {
  const box = nodeBox(node);
  return { w: box.width, h: box.height };
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

const GROUP_JOIN_PAD = 24;

type GroupHull = {
  gid: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

function groupMembers(nodes: CanvasNode[]) {
  const members = new Map<string, CanvasNode[]>();
  for (const node of nodes) {
    const gid = groupIdOf(node);
    if (!gid) continue;
    const list = members.get(gid) ?? [];
    list.push(node);
    members.set(gid, list);
  }
  return members;
}

function hullsForStationaryGroups(
  nodes: CanvasNode[],
  moved: Set<string>,
): GroupHull[] {
  const members = groupMembers(nodes);
  const targets: GroupHull[] = [];
  for (const [gid, list] of members) {
    const still = list.filter((node) => !moved.has(node.id));
    if (!still.length) continue;
    const bounds = selectionBounds(still);
    if (!bounds) continue;
    targets.push({
      gid,
      x: bounds.x - GROUP_JOIN_PAD,
      y: bounds.y - GROUP_JOIN_PAD,
      w: bounds.w + GROUP_JOIN_PAD * 2,
      h: bounds.h + GROUP_JOIN_PAD * 2,
    });
  }
  return targets;
}

function hitHull(targets: GroupHull[], cx: number, cy: number) {
  const hits = targets
    .filter(
      (target) =>
        cx >= target.x &&
        cx <= target.x + target.w &&
        cy >= target.y &&
        cy <= target.y + target.h,
    )
    .sort((a, b) => a.w * a.h - b.w * b.h);
  return hits[0]?.gid ?? null;
}

/** World-space drop target under the moved selection center (for live highlight). */
export function findGroupDropTarget(
  nodes: CanvasNode[],
  movedIds: string[],
) {
  const moved = new Set(movedIds);
  if (!moved.size) return null;
  const targets = hullsForStationaryGroups(nodes, moved);
  if (!targets.length) return null;
  const movedNodes = nodes.filter((node) => moved.has(node.id));
  const bounds = selectionBounds(movedNodes);
  if (!bounds) return null;
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  return hitHull(targets, cx, cy);
}

function clearGroupId(node: CanvasNode): CanvasNode {
  if (!groupIdOf(node)) return node;
  const { groupId: _drop, ...rest } = node.data;
  return { ...node, data: rest };
}

/**
 * After a drag / nudge: join or leave groups by center hit.
 * Full-group moves can merge into another stationary group.
 */
export function applyGroupDrop(nodes: CanvasNode[], movedIds: string[]) {
  const moved = new Set(movedIds);
  if (!moved.size) return nodes;

  const members = groupMembers(nodes);
  const targets = hullsForStationaryGroups(nodes, moved);
  const fullMovedGroups = new Set<string>();
  for (const [gid, list] of members) {
    if (list.length && list.every((node) => moved.has(node.id))) {
      fullMovedGroups.add(gid);
    }
  }

  let changed = false;
  const assign = new Map<string, string | null>();

  for (const gid of fullMovedGroups) {
    const list = members.get(gid) ?? [];
    const bounds = selectionBounds(list);
    if (!bounds) continue;
    const hit = hitHull(
      targets.filter((target) => target.gid !== gid),
      bounds.x + bounds.w / 2,
      bounds.y + bounds.h / 2,
    );
    if (!hit || hit === gid) continue;
    for (const node of list) assign.set(node.id, hit);
  }

  for (const node of nodes) {
    if (!moved.has(node.id) || assign.has(node.id)) continue;
    const own = groupIdOf(node);
    if (own && fullMovedGroups.has(own)) continue;

    const box = nodeBox(node);
    const hit = hitHull(
      targets,
      box.x + box.width / 2,
      box.y + box.height / 2,
    );
    if (hit === own || (!hit && !own)) continue;
    assign.set(node.id, hit);
  }

  if (!assign.size) return nodes;

  const next = nodes.map((node) => {
    if (!assign.has(node.id)) return node;
    changed = true;
    const hit = assign.get(node.id) ?? null;
    if (hit) return { ...node, data: { ...node.data, groupId: hit } };
    return clearGroupId(node);
  });

  if (!changed) return nodes;

  // Drop orphan singleton group tags.
  const counts = new Map<string, number>();
  for (const node of next) {
    const gid = groupIdOf(node);
    if (!gid) continue;
    counts.set(gid, (counts.get(gid) ?? 0) + 1);
  }
  return next.map((node) => {
    const gid = groupIdOf(node);
    if (!gid || (counts.get(gid) ?? 0) >= 2) return node;
    return clearGroupId(node);
  });
}
