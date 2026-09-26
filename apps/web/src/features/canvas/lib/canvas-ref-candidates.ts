import type { CanvasNode } from "@joyai/shared";

export type CanvasRefKind = "text" | "video" | "image" | "audio";

export function canvasRefKindOf(node: CanvasNode): CanvasRefKind | null {
  if (node.type === "text") return "text";
  if (node.type === "video") return "video";
  if (node.type === "image" || node.type === "panorama") return "image";
  if (node.type === "audio") return "audio";
  return null;
}

/** Nodes that can be used as generation references (must already live on canvas). */
export function isCanvasRefCandidate(node: CanvasNode, hostId: string) {
  if (node.id === hostId) return false;
  const kind = canvasRefKindOf(node);
  if (!kind) return false;
  if (kind === "text") {
    const text = String(node.data.text ?? "").trim();
    return Boolean(text) && text !== "双击编辑文本";
  }
  const url = String(node.data.url ?? "").trim();
  return Boolean(url) && !url.startsWith("data:");
}
