import type { CanvasNode } from "@joyai/shared";

export type VideoFrameSlot = {
  nodeId: string;
  assetId: string;
  url: string;
  label: string;
};

function isImageLike(node: CanvasNode) {
  return node.type === "image" || node.type === "panorama";
}

function mediaUrl(node: CanvasNode) {
  const url = String(node.data.url ?? "");
  if (!url || url.startsWith("data:")) return "";
  return url;
}

/** Image candidates for first/last frame: self (if image) + incoming edge images. */
export function collectVideoFrameCandidates(
  nodes: CanvasNode[],
  edges: { source: string; target: string }[],
  host: CanvasNode,
): VideoFrameSlot[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: VideoFrameSlot[] = [];
  const seen = new Set<string>();

  const push = (node: CanvasNode | undefined, label: string) => {
    if (!node || !isImageLike(node)) return;
    const url = mediaUrl(node);
    if (!url || seen.has(node.id)) return;
    seen.add(node.id);
    out.push({
      nodeId: node.id,
      assetId: String(node.data.assetId ?? ""),
      url,
      label,
    });
  };

  if (isImageLike(host)) push(host, "当前图");

  let index = 0;
  for (const edge of edges) {
    if (edge.target !== host.id) continue;
    const source = byId.get(edge.source);
    if (!source || !isImageLike(source)) continue;
    index += 1;
    push(source, `连入图 ${index}`);
  }

  return out;
}

export function resolveVideoFrameSlots(opts: {
  candidates: VideoFrameSlot[];
  firstFrameNodeId?: string | null;
  lastFrameNodeId?: string | null;
}) {
  const { candidates } = opts;
  const byId = new Map(candidates.map((item) => [item.nodeId, item]));
  const first =
    (opts.firstFrameNodeId && byId.get(opts.firstFrameNodeId)) ||
    candidates[0] ||
    null;
  const last =
    (opts.lastFrameNodeId && byId.get(opts.lastFrameNodeId)) ||
    (candidates.length > 1
      ? candidates.find((item) => item.nodeId !== first?.nodeId) || null
      : null);
  return { first, last };
}

/**
 * Build ordered image refs for video jobs.
 * first_last mode: [first, last, ...others]
 * otherwise keep candidate order / merged refs.
 */
export function orderVideoImageRefs(opts: {
  first: VideoFrameSlot | null;
  last: VideoFrameSlot | null;
  otherAssetIds: string[];
  otherUrls: string[];
}): {
  referenceAssetIds: string[];
  referenceUrls: string[];
  refMode: "omni" | "first_last" | undefined;
} {
  const assetIds: string[] = [];
  const urls: string[] = [];
  const seenAsset = new Set<string>();
  const seenUrl = new Set<string>();

  const pushSlot = (slot: VideoFrameSlot | null) => {
    if (!slot) return;
    if (slot.assetId && !seenAsset.has(slot.assetId)) {
      seenAsset.add(slot.assetId);
      assetIds.push(slot.assetId);
    }
    if (slot.url && !seenUrl.has(slot.url)) {
      seenUrl.add(slot.url);
      urls.push(slot.url);
    }
  };

  pushSlot(opts.first);
  pushSlot(opts.last);

  for (const id of opts.otherAssetIds) {
    if (!id || seenAsset.has(id)) continue;
    seenAsset.add(id);
    assetIds.push(id);
  }
  for (const url of opts.otherUrls) {
    if (!url || url.startsWith("data:") || seenUrl.has(url)) continue;
    seenUrl.add(url);
    urls.push(url);
  }

  const frameCount = Number(Boolean(opts.first)) + Number(Boolean(opts.last));
  const refMode =
    frameCount >= 2
      ? ("first_last" as const)
      : frameCount === 1 || urls.length > 0
        ? ("omni" as const)
        : undefined;

  return { referenceAssetIds: assetIds, referenceUrls: urls, refMode };
}
