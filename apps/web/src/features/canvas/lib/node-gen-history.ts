import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "../store";

export type NodeGenVersion = {
  assetId: string;
  url: string;
  jobId?: string;
  createdAt: string;
  prompt?: string;
};

const MAX_HISTORY = 30;

function isRealMedia(url: string, assetId: string) {
  return Boolean(url.trim()) && !url.startsWith("data:") && Boolean(assetId.trim());
}

export function readGenHistory(data: CanvasNode["data"]): NodeGenVersion[] {
  const raw = data.genHistory;
  if (!Array.isArray(raw)) return [];
  const out: NodeGenVersion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const assetId = String(row.assetId ?? "").trim();
    const url = String(row.url ?? "").trim();
    if (!isRealMedia(url, assetId)) continue;
    out.push({
      assetId,
      url,
      jobId: String(row.jobId ?? "").trim() || undefined,
      createdAt: String(row.createdAt ?? "").trim() || new Date(0).toISOString(),
      prompt: String(row.prompt ?? "").trim() || undefined,
    });
  }
  return out;
}

function currentVersion(node: CanvasNode): NodeGenVersion | null {
  const url = String(node.data.url ?? "").trim();
  const assetId = String(node.data.assetId ?? "").trim();
  if (!isRealMedia(url, assetId)) return null;
  return {
    assetId,
    url,
    jobId: String(node.data.jobId ?? "").trim() || undefined,
    createdAt: new Date().toISOString(),
    prompt: String(node.data.prompt ?? node.data.genDraft ?? "").trim() || undefined,
  };
}

/** Push the node's current media into genHistory before overwrite. */
export function archiveNodeMedia(nodeId: string) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  if (
    node.type !== "image" &&
    node.type !== "video" &&
    node.type !== "panorama" &&
    node.type !== "audio"
  ) {
    return;
  }
  const cur = currentVersion(node);
  if (!cur) return;
  const prev = readGenHistory(node.data).filter(
    (item) => item.assetId !== cur.assetId,
  );
  store.updateNodeData(nodeId, {
    genHistory: [cur, ...prev].slice(0, MAX_HISTORY),
  });
}

/** Apply a historical version onto the node (archives current first). */
export function restoreNodeMedia(nodeId: string, version: NodeGenVersion) {
  const store = useCanvasStore.getState();
  const node = store.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  const cur = currentVersion(node);
  if (cur && cur.assetId === version.assetId) return;
  store.pushHistory();
  archiveNodeMedia(nodeId);
  store.updateNodeData(nodeId, {
    url: version.url,
    assetId: version.assetId,
    jobId: version.jobId ?? "",
    status: "succeeded",
    error: "",
    ...(version.prompt ? { prompt: version.prompt } : {}),
  });
}

/**
 * Sibling result images sharing a prompt with this node (same generation lineage).
 */
export function siblingResultVersions(nodeId: string): NodeGenVersion[] {
  const { nodes, edges } = useCanvasStore.getState();
  const promptIds = new Set<string>();
  for (const edge of edges) {
    if (edge.target === nodeId) {
      const src = nodes.find((item) => item.id === edge.source);
      if (src?.type === "prompt") promptIds.add(src.id);
    }
    if (edge.source === nodeId) {
      const dst = nodes.find((item) => item.id === edge.target);
      if (dst?.type === "prompt") promptIds.add(dst.id);
    }
  }
  if (!promptIds.size) return [];

  const seen = new Set<string>();
  const out: NodeGenVersion[] = [];
  for (const edge of edges) {
    const otherId =
      promptIds.has(edge.source) && edge.target !== nodeId
        ? edge.target
        : promptIds.has(edge.target) && edge.source !== nodeId
          ? edge.source
          : null;
    if (!otherId || seen.has(otherId)) continue;
    const other = nodes.find((item) => item.id === otherId);
    if (!other || (other.type !== "image" && other.type !== "panorama")) {
      continue;
    }
    const ver = currentVersion(other);
    if (!ver || seen.has(ver.assetId)) continue;
    seen.add(otherId);
    seen.add(ver.assetId);
    out.push(ver);
  }
  return out;
}
