import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "../store";

export function isBatchRoot(node: CanvasNode) {
  return Boolean(node.data.isBatchRoot);
}

export function batchRootIdOf(node: CanvasNode) {
  const id = String(node.data.batchRootId ?? "").trim();
  return id || null;
}

export function batchChildIdsOf(node: CanvasNode): string[] {
  const raw = node.data.batchChildIds;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id)).filter(Boolean);
}

export function isBatchExpanded(node: CanvasNode) {
  return Boolean(node.data.imageBatchExpanded);
}

/** Children of a collapsed batch should not paint or hit-test. */
export function isHiddenBatchChild(node: CanvasNode, nodes: CanvasNode[]) {
  const rootId = batchRootIdOf(node);
  if (!rootId) return false;
  const root = nodes.find((item) => item.id === rootId);
  if (!root || !isBatchRoot(root)) return false;
  return !isBatchExpanded(root);
}

export function batchMemberIds(root: CanvasNode): string[] {
  return [root.id, ...batchChildIdsOf(root)];
}

/** Expand drag/selection set so moving a batch root moves its children. */
export function expandIdsWithBatch(nodes: CanvasNode[], ids: string[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set(ids);
  for (const id of ids) {
    const node = byId.get(id);
    if (!node) continue;
    if (isBatchRoot(node) && !isBatchExpanded(node)) {
      for (const childId of batchChildIdsOf(node)) out.add(childId);
    }
  }
  return [...out];
}

export function toggleBatchExpanded(rootId: string) {
  const state = useCanvasStore.getState();
  const root = state.nodes.find((n) => n.id === rootId);
  if (!root || !isBatchRoot(root)) return;
  state.pushHistory();
  state.updateNodeData(rootId, {
    imageBatchExpanded: !isBatchExpanded(root),
  });
}

/** Copy child media onto root and mark as primary. */
export function setBatchPrimary(rootId: string, childId: string) {
  const state = useCanvasStore.getState();
  const root = state.nodes.find((n) => n.id === rootId);
  const child = state.nodes.find((n) => n.id === childId);
  if (!root || !child || !isBatchRoot(root)) return;
  if (!batchChildIdsOf(root).includes(childId) && childId !== rootId) return;
  state.pushHistory();
  const url = String(child.data.url ?? "");
  const assetId = String(child.data.assetId ?? "");
  state.updateNodeData(rootId, {
    primaryImageId: childId,
    url,
    assetId,
    mediaWidth: child.data.mediaWidth,
    mediaHeight: child.data.mediaHeight,
    title: String(child.data.title ?? root.data.title ?? ""),
    status: "succeeded",
    error: "",
  });
}

/**
 * After multi-asset fan-out, mark first image as batch root and link siblings.
 * Only applies to image/panorama (not video).
 */
export function linkImageBatch(filledIds: string[]) {
  const imageIds = filledIds.filter((id) => {
    const node = useCanvasStore.getState().nodes.find((n) => n.id === id);
    return node && (node.type === "image" || node.type === "panorama");
  });
  if (imageIds.length < 2) return;

  const rootId = imageIds[0]!;
  const childIds = imageIds.slice(1);
  const state = useCanvasStore.getState();
  const root = state.nodes.find((n) => n.id === rootId);
  if (!root) return;

  state.updateNodeData(rootId, {
    isBatchRoot: true,
    batchChildIds: childIds,
    primaryImageId: rootId,
    imageBatchExpanded: false,
    batchCount: imageIds.length,
  });
  for (const childId of childIds) {
    state.updateNodeData(childId, {
      batchRootId: rootId,
      isBatchRoot: false,
      batchChildIds: [],
      imageBatchExpanded: false,
    });
  }
}
