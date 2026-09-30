import type { CanvasNode, CanvasNodeType } from "@joyai/shared";

export type CanvasRefKind = "text" | "video" | "image" | "audio";

export type CanvasAssetRefKind = "image" | "video" | "audio";

export function canvasRefKindOf(node: CanvasNode): CanvasRefKind | null {
  if (node.type === "text") return "text";
  if (node.type === "video") return "video";
  if (node.type === "image" || node.type === "panorama") return "image";
  if (node.type === "audio") return "audio";
  return null;
}

export function isAllowedCanvasRefKind(
  kind: CanvasRefKind,
  allowed?: readonly CanvasRefKind[] | null,
) {
  if (!allowed?.length) return true;
  return allowed.includes(kind);
}

/**
 * Generation host → allowed incoming reference kinds.
 *
 * - image / panorama: 图 + 文本（图生图；TTS/音频不作图参考）
 * - video: 图 / 视频 / 音频 + 文本（含 omni 多模态）
 * - audio: 音频 + 文本（TTS；不能参考图/视频）
 * - text / prompt: 图 + 文本（视觉理解 / 引用文案）
 */
export function hostRefKindsFor(
  hostType: CanvasNodeType | string,
): readonly CanvasRefKind[] | null {
  switch (hostType) {
    case "image":
    case "panorama":
      return ["image", "text"];
    case "video":
      return ["image", "video", "audio", "text"];
    case "audio":
      return ["audio", "text"];
    case "text":
    case "prompt":
      return ["image", "text"];
    default:
      // director / unknown — not a generation ref host
      return null;
  }
}

/** Asset-library kinds for「选择素材」(no text assets). */
export function hostAssetKindsFor(
  hostType: CanvasNodeType | string,
): readonly CanvasAssetRefKind[] | null {
  switch (hostType) {
    case "image":
    case "panorama":
    case "text":
    case "prompt":
      return ["image"];
    case "video":
      return ["image", "video", "audio"];
    case "audio":
      return ["audio"];
    default:
      return null;
  }
}

export function isAllowedRefSourceForHost(
  source: CanvasNode,
  host: CanvasNode,
): boolean {
  const allowed = hostRefKindsFor(host.type);
  if (!allowed) return true;
  const kind = canvasRefKindOf(source);
  if (!kind) return true;
  return allowed.includes(kind);
}

/** Nodes that can be used as generation references (must already live on canvas). */
export function isCanvasRefCandidate(
  node: CanvasNode,
  hostId: string,
  allowedKinds?: readonly CanvasRefKind[] | null,
) {
  if (node.id === hostId) return false;
  const kind = canvasRefKindOf(node);
  if (!kind) return false;
  if (!isAllowedCanvasRefKind(kind, allowedKinds)) return false;
  if (kind === "text") {
    const text = String(node.data.text ?? "").trim();
    return Boolean(text) && text !== "双击编辑文本";
  }
  const url = String(node.data.url ?? "").trim();
  return Boolean(url) && !url.startsWith("data:");
}
