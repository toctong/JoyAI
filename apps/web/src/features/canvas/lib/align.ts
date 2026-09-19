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

export type LayoutMode = "grid" | "smart";

type AlignUnit = {
  ids: string[];
  x: number;
  y: number;
  w: number;
  h: number;
};

function sizeOf(node: CanvasNode) {
  const box = nodeBox(node);
  return { w: box.width, h: box.height };
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

export function groupNameOf(node: CanvasNode) {
  const name = node.data.groupName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function withoutGroup(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...data };
  delete next.groupId;
  delete next.groupName;
  return next;
}

/** Stable labels: stored name, otherwise 编组 1 / 2 / … in node order. */
export function groupLabels(nodes: CanvasNode[]) {
  const labels = new Map<string, string>();
  let index = 0;
  for (const node of nodes) {
    const gid = groupIdOf(node);
    if (!gid || labels.has(gid)) continue;
    const count = nodes.reduce(
      (sum, item) => sum + (groupIdOf(item) === gid ? 1 : 0),
      0,
    );
    if (count < 2) continue;
    index += 1;
    const stored = nodes.reduce<string | null>((found, item) => {
      if (found || groupIdOf(item) !== gid) return found;
      return groupNameOf(item);
    }, null);
    labels.set(gid, stored ?? `编组 ${index}`);
  }
  return labels;
}

export function nextGroupLabel(nodes: CanvasNode[]) {
  let max = 0;
  const seen = new Set<string>();
  for (const node of nodes) {
    const gid = groupIdOf(node);
    if (!gid || seen.has(gid)) continue;
    seen.add(gid);
    const match = groupNameOf(node)?.match(/^编组\s*(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `编组 ${Math.max(max, seen.size) + 1}`;
}

/** True when selection is exactly all members of one group (and that group only). */
export function isCompleteGroupSelection(
  nodes: CanvasNode[],
  selectedIds: string[],
  gid?: string | null,
) {
  if (selectedIds.length < 2) return false;
  const selected = new Set(selectedIds);
  const groupIds = new Set<string>();
  for (const id of selectedIds) {
    const node = nodes.find((item) => item.id === id);
    const g = node ? groupIdOf(node) : null;
    if (!g) return false;
    groupIds.add(g);
  }
  if (groupIds.size !== 1) return false;
  const only = [...groupIds][0]!;
  if (gid && only !== gid) return false;
  const members = nodes.filter((node) => groupIdOf(node) === only);
  return (
    members.length === selectedIds.length &&
    members.every((node) => selected.has(node.id))
  );
}

export function memberIdsOfGroup(nodes: CanvasNode[], gid: string) {
  return nodes.filter((node) => groupIdOf(node) === gid).map((node) => node.id);
}

function nameOfGroup(nodes: CanvasNode[], gid: string) {
  for (const node of nodes) {
    if (groupIdOf(node) !== gid) continue;
    const name = groupNameOf(node);
    if (name) return name;
  }
  return null;
}

/**
 * Align units = each selected node (Figma-style).
 * Groups only affect move/select-together; align always rearranges nodes relative to each other.
 */
function buildAlignUnits(nodes: CanvasNode[], ids: string[]): AlignUnit[] {
  const idSet = new Set(ids);
  const units: AlignUnit[] = [];
  for (const node of nodes) {
    if (!idSet.has(node.id)) continue;
    const box = nodeBox(node);
    units.push({
      ids: [node.id],
      x: box.x,
      y: box.y,
      w: box.width,
      h: box.height,
    });
  }
  return units;
}

function applyUnitDeltas(
  nodes: CanvasNode[],
  deltas: Map<string, { dx: number; dy: number }>,
) {
  if (!deltas.size) return nodes;
  return nodes.map((node) => {
    const delta = deltas.get(node.id);
    if (!delta) return node;
    if (delta.dx === 0 && delta.dy === 0) return node;
    return { ...node, x: node.x + delta.dx, y: node.y + delta.dy };
  });
}

export function alignNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: AlignMode,
): CanvasNode[] {
  const units = buildAlignUnits(nodes, ids);
  if (units.length < 2) return nodes;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const unit of units) {
    minX = Math.min(minX, unit.x);
    minY = Math.min(minY, unit.y);
    maxX = Math.max(maxX, unit.x + unit.w);
    maxY = Math.max(maxY, unit.y + unit.h);
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const deltas = new Map<string, { dx: number; dy: number }>();
  for (const unit of units) {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left":
        dx = minX - unit.x;
        break;
      case "center-x":
        dx = midX - unit.w / 2 - unit.x;
        break;
      case "right":
        dx = maxX - unit.w - unit.x;
        break;
      case "top":
        dy = minY - unit.y;
        break;
      case "center-y":
        dy = midY - unit.h / 2 - unit.y;
        break;
      case "bottom":
        dy = maxY - unit.h - unit.y;
        break;
      default:
        break;
    }
    if (dx === 0 && dy === 0) continue;
    for (const id of unit.ids) deltas.set(id, { dx, dy });
  }
  return applyUnitDeltas(nodes, deltas);
}

const MIN_GAP = 40;

function packGap(span: number, totalSize: number, count: number) {
  if (count < 2) return MIN_GAP;
  return Math.max(MIN_GAP, (span - totalSize) / (count - 1));
}

export function distributeNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: DistributeMode,
): CanvasNode[] {
  const units = buildAlignUnits(nodes, ids);
  if (units.length < 3) return nodes;

  const deltas = new Map<string, { dx: number; dy: number }>();

  if (mode === "horizontal") {
    const sorted = [...units].sort((a, b) => a.x - b.x || a.y - b.y);
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const span = last.x + last.w - first.x;
    const totalW = sorted.reduce((sum, unit) => sum + unit.w, 0);
    const gap = packGap(span, totalW, sorted.length);
    let cursor = first.x;
    for (const unit of sorted) {
      const dx = cursor - unit.x;
      if (dx !== 0) {
        for (const id of unit.ids) deltas.set(id, { dx, dy: 0 });
      }
      cursor += unit.w + gap;
    }
    return applyUnitDeltas(nodes, deltas);
  }

  const sorted = [...units].sort((a, b) => a.y - b.y || a.x - b.x);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = last.y + last.h - first.y;
  const totalH = sorted.reduce((sum, unit) => sum + unit.h, 0);
  const gap = packGap(span, totalH, sorted.length);
  let cursor = first.y;
  for (const unit of sorted) {
    const dy = cursor - unit.y;
    if (dy !== 0) {
      for (const id of unit.ids) deltas.set(id, { dx: 0, dy });
    }
    cursor += unit.h + gap;
  }
  return applyUnitDeltas(nodes, deltas);
}

/** Lay overlapping nodes out in a row or column so they no longer stack. */
export function packNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: DistributeMode,
): CanvasNode[] {
  const units = buildAlignUnits(nodes, ids);
  if (units.length < 2) return nodes;

  const originX = Math.min(...units.map((unit) => unit.x));
  const originY = Math.min(...units.map((unit) => unit.y));
  const sorted =
    mode === "horizontal"
      ? [...units].sort((a, b) => a.x - b.x || a.y - b.y)
      : [...units].sort((a, b) => a.y - b.y || a.x - b.x);
  const deltas = new Map<string, { dx: number; dy: number }>();
  let cursor = mode === "horizontal" ? originX : originY;

  for (const unit of sorted) {
    const dx = mode === "horizontal" ? cursor - unit.x : originX - unit.x;
    const dy = mode === "horizontal" ? originY - unit.y : cursor - unit.y;
    if (dx !== 0 || dy !== 0) {
      for (const id of unit.ids) deltas.set(id, { dx, dy });
    }
    cursor += (mode === "horizontal" ? unit.w : unit.h) + MIN_GAP;
  }
  return applyUnitDeltas(nodes, deltas);
}

const LAYOUT_GAP = 40;

function readingOrder(units: AlignUnit[]) {
  return [...units].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * 宫格：等大格子，尽量接近方形。
 * 智能：按当前选区宽度从左到右换行；叠在一起时宽度不够，会自动变成竖排并留出间距。
 */
export function layoutNodes(
  nodes: CanvasNode[],
  ids: string[],
  mode: LayoutMode,
): CanvasNode[] {
  const units = buildAlignUnits(nodes, ids);
  if (units.length < 2) return nodes;

  const sorted = readingOrder(units);
  const originX = Math.min(...sorted.map((unit) => unit.x));
  const originY = Math.min(...sorted.map((unit) => unit.y));
  const deltas = new Map<string, { dx: number; dy: number }>();

  if (mode === "grid") {
    const cols = Math.ceil(Math.sqrt(sorted.length));
    const cellW = Math.max(...sorted.map((unit) => unit.w));
    const cellH = Math.max(...sorted.map((unit) => unit.h));
    sorted.forEach((unit, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x =
        originX + col * (cellW + LAYOUT_GAP) + (cellW - unit.w) / 2;
      const y = originY + row * (cellH + LAYOUT_GAP);
      const dx = x - unit.x;
      const dy = y - unit.y;
      if (dx === 0 && dy === 0) return;
      for (const id of unit.ids) deltas.set(id, { dx, dy });
    });
    return applyUnitDeltas(nodes, deltas);
  }

  const maxW = Math.max(...sorted.map((unit) => unit.w));
  const spanW = Math.max(...sorted.map((unit) => unit.x + unit.w)) - originX;
  const rowLimit = Math.max(maxW, spanW);
  let cursorX = originX;
  let cursorY = originY;
  let rowH = 0;
  for (const unit of sorted) {
    if (cursorX !== originX && cursorX + unit.w > originX + rowLimit + 0.5) {
      cursorX = originX;
      cursorY += rowH + LAYOUT_GAP;
      rowH = 0;
    }
    const dx = cursorX - unit.x;
    const dy = cursorY - unit.y;
    if (dx !== 0 || dy !== 0) {
      for (const id of unit.ids) deltas.set(id, { dx, dy });
    }
    cursorX += unit.w + LAYOUT_GAP;
    rowH = Math.max(rowH, unit.h);
  }
  return applyUnitDeltas(nodes, deltas);
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

  const members = groupMembers(nodes);
  const fullMovedGroups = new Set<string>();
  for (const [gid, list] of members) {
    if (list.length && list.every((node) => moved.has(node.id))) {
      fullMovedGroups.add(gid);
    }
  }
  // Whole-group drags don't join/leave — no drop highlight.
  const onlyFullGroups = [...moved].every((id) => {
    const node = nodes.find((item) => item.id === id);
    const gid = node ? groupIdOf(node) : null;
    return Boolean(gid && fullMovedGroups.has(gid));
  });
  if (onlyFullGroups) return null;

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
  return { ...node, data: withoutGroup(node.data) };
}

/**
 * After Alt-drag / partial move: join or leave groups by center hit.
 * Full-group moves only relocate — they do not auto-merge (Figma-style).
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

  for (const node of nodes) {
    if (!moved.has(node.id)) continue;
    const own = groupIdOf(node);
    // Whole-group drag: keep membership, ignore drop merge.
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
    if (hit) {
      const name = nameOfGroup(nodes, hit);
      const data: Record<string, unknown> = { ...node.data, groupId: hit };
      if (name) data.groupName = name;
      else delete data.groupName;
      return { ...node, data };
    }
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

/** How many selected nodes participate in align / distribute. */
export function alignUnitCount(nodes: CanvasNode[], ids: string[]) {
  return buildAlignUnits(nodes, ids).length;
}
