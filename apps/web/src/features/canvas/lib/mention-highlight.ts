import type { CanvasNode } from "@joyai/shared";

const MEDIA = new Set(["image", "video", "panorama", "audio"]);

/** Bidirectional @-mention / edge highlight between prompt ↔ media nodes. */
export function computeMentionHighlightIds(
  nodes: CanvasNode[],
  selectedIds: string[],
  edges: { source: string; target: string }[] = [],
): string[] {
  if (!selectedIds.length) return [];
  const selected = nodes.filter((n) => selectedIds.includes(n.id));
  const out = new Set<string>();
  const byId = new Map(nodes.map((n) => [n.id, n]));

  for (const n of selected) {
    if (n.type === "prompt") {
      const refs = asStringArray(n.data.referenceIds);
      const urls = asStringArray(n.data.referenceUrls);
      for (const other of nodes) {
        if (!MEDIA.has(other.type) || other.id === n.id) continue;
        if (matchesReference(other, refs, urls)) out.add(other.id);
      }
      for (const edge of edges) {
        if (edge.target !== n.id) continue;
        const source = byId.get(edge.source);
        if (source && MEDIA.has(source.type)) out.add(source.id);
      }
    }
    if (MEDIA.has(n.type)) {
      const aid = String(n.data.assetId ?? "");
      const url = String(n.data.url ?? "");
      for (const other of nodes) {
        if (other.type !== "prompt") continue;
        const refs = asStringArray(other.data.referenceIds);
        const urls = asStringArray(other.data.referenceUrls);
        if (
          (aid && refs.includes(aid)) ||
          refs.includes(n.id) ||
          (url && urls.includes(url))
        ) {
          out.add(other.id);
        }
      }
      for (const edge of edges) {
        if (edge.source !== n.id) continue;
        const target = byId.get(edge.target);
        if (target?.type === "prompt") out.add(target.id);
      }
    }
  }

  return [...out];
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(String).filter(Boolean);
}

function matchesReference(
  node: CanvasNode,
  refs: string[],
  urls: string[],
) {
  const aid = String(node.data.assetId ?? "");
  const url = String(node.data.url ?? "");
  return (
    (aid && refs.includes(aid)) ||
    refs.includes(node.id) ||
    (url && urls.includes(url))
  );
}
