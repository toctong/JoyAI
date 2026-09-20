import type { CanvasNode } from "@joyai/shared";
import type { PromptGeneratePayload } from "@/features/ai-prompt";
import { mentionExpandText } from "@/features/ai-prompt";

const MEDIA_TYPES = new Set(["image", "video", "panorama", "audio", "text"]);

export type CanvasMentionItem = {
  id: string;
  label: string;
  url: string;
  mediaKind: "image" | "video" | "audio" | "text";
  expandText: string;
};

function mediaKindOf(
  type: CanvasNode["type"],
): "image" | "video" | "audio" | "text" | null {
  if (type === "image" || type === "panorama") return "image";
  if (type === "video") return "video";
  if (type === "audio") return "audio";
  if (type === "text") return "text";
  return null;
}

/** Build @-mention items from canvas media nodes (caller scopes which nodes). */
export function buildCanvasMentionItems(
  nodes: CanvasNode[],
): CanvasMentionItem[] {
  const counters = { image: 0, video: 0, audio: 0, text: 0 };
  const out: CanvasMentionItem[] = [];
  for (const n of nodes) {
    const kind = mediaKindOf(n.type);
    if (!kind) continue;
    if (kind === "text") {
      const text = String(n.data.text ?? "").trim();
      if (!text || text === "双击编辑文本") continue;
      counters.text += 1;
      const index1 = counters.text;
      out.push({
        id: n.id,
        label: `@文本${index1}`,
        url: "",
        mediaKind: "text",
        expandText: text.slice(0, 2000),
      });
      continue;
    }
    const url = String(n.data.url ?? n.data.src ?? "");
    if (!url || url.startsWith("data:")) continue;
    const assetId = String(n.data.assetId ?? "");
    counters[kind] += 1;
    const index1 = counters[kind];
    const labelPrefix =
      kind === "video" ? "视频" : kind === "audio" ? "音频" : "图片";
    out.push({
      id: assetId || n.id,
      label: `@${labelPrefix}${index1}`,
      url,
      mediaKind: kind,
      expandText: mentionExpandText(kind, index1),
    });
  }
  return out;
}

export function collectIncomingMediaFromEdges(
  nodes: CanvasNode[],
  edges: { source: string; target: string }[],
  promptId: string,
) {
  const incoming = edges
    .filter((e) => e.target === promptId)
    .map((e) => nodes.find((n) => n.id === e.source))
    .filter(
      (n): n is CanvasNode => n != null && MEDIA_TYPES.has(n.type),
    );
  const edgeAssetIds = incoming
    .filter((n) => n.type !== "text")
    .map((n) => String(n.data.assetId ?? ""))
    .filter(Boolean);
  const edgeUrls = incoming
    .filter((n) => n.type !== "text")
    .map((n) => String(n.data.url ?? ""))
    .filter((u) => u && !u.startsWith("data:"));
  const texts = incoming
    .filter((n) => n.type === "text")
    .map((n) => String(n.data.text ?? "").trim())
    .filter((text) => text && text !== "双击编辑文本");
  return { edgeAssetIds, edgeUrls, incoming, texts };
}

/** Merge editor payload + edge refs into job reference lists (Studio parity). */
export function mergeJobReferences(
  payload: PromptGeneratePayload,
  edgeAssetIds: string[],
  edgeUrls: string[],
  includeAv: boolean,
) {
  const referenceAssetIds = [
    ...new Set([...payload.assetIds, ...edgeAssetIds]),
  ];
  const fromPayload = includeAv
    ? [...payload.imageUrls, ...payload.videoUrls, ...payload.audioUrls]
    : [...payload.imageUrls];
  const referenceUrls = [...new Set([...fromPayload, ...edgeUrls])].filter(
    (u) => u && !u.startsWith("data:") && !u.startsWith("blob:"),
  );
  const nodeIds = [] as string[];
  return { referenceAssetIds, referenceUrls, nodeIds };
}

/** Append connected text nodes that are not already in the prompt. */
export function appendTextRefs(prompt: string, texts: string[]) {
  const base = prompt.trim();
  const extra = texts
    .map((text) => text.trim())
    .filter((text) => text && !base.includes(text));
  if (!extra.length) return base;
  const blocks = extra
    .map((text, index) => `【文本${index + 1}】\n${text}`)
    .join("\n\n");
  return base ? `${base}\n\n${blocks}` : blocks;
}

export function resolveMentionedNodeIds(
  nodes: CanvasNode[],
  payload: PromptGeneratePayload,
) {
  const allUrls = [
    ...payload.imageUrls,
    ...payload.videoUrls,
    ...payload.audioUrls,
  ];
  return nodes
    .filter((n) => MEDIA_TYPES.has(n.type))
    .filter((n) => {
      const aid = String(n.data.assetId ?? "");
      const url = String(n.data.url ?? "");
      return (
        (aid && payload.assetIds.includes(aid)) ||
        payload.assetIds.includes(n.id) ||
        (url && allUrls.includes(url))
      );
    })
    .map((n) => n.id);
}

export function mediaRefFromNode(node: CanvasNode) {
  const assetId = String(node.data.assetId ?? "");
  const refUrl = String(node.data.url ?? "");
  return {
    referenceIds: assetId ? [assetId, node.id] : [node.id],
    referenceUrls: refUrl && !refUrl.startsWith("data:") ? [refUrl] : [],
  };
}
