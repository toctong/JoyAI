import type { CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "../store";
import { nodeDefaultSize } from "../node-registry";

/**
 * Fit media keeping aspect.
 * Uses the longer side of the max box as the target edge so portrait
 * (竖图) and landscape get similar on-canvas weight — not squeezed into
 * a short landscape frame.
 */
export function fitNodeSize(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const maxEdge = Math.max(maxWidth, maxHeight);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  return {
    width: Math.max(48, Math.round(w * scale)),
    height: Math.max(48, Math.round(h * scale)),
  };
}

function probeImageSize(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve(
        image.naturalWidth > 0
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null,
      );
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function probeVideoSize(src: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      resolve(
        video.videoWidth > 0
          ? { width: video.videoWidth, height: video.videoHeight }
          : null,
      );
      video.removeAttribute("src");
      video.load();
    };
    video.onerror = () => resolve(null);
    video.src = src;
  });
}

export async function probeFileMediaSize(file: File) {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/")) return await probeVideoSize(url);
    if (file.type.startsWith("image/")) return await probeImageSize(url);
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize an image/video node to the media aspect. Panorama stays 2:1. */
export async function frameNodeToMedia(
  nodeId: string,
  source: File | string,
  kind: CanvasNodeType,
) {
  if (kind !== "image" && kind !== "video") return;
  const natural =
    typeof source === "string"
      ? kind === "video"
        ? await probeVideoSize(source)
        : await probeImageSize(source)
      : await probeFileMediaSize(source);
  if (!natural) return;
  const max = nodeDefaultSize(kind);
  // Slightly larger than blank 16:9 so portrait nodes read clearly.
  const fitEdge = Math.max(max.width, max.height, 500);
  const fitted = fitNodeSize(
    natural.width,
    natural.height,
    fitEdge,
    fitEdge,
  );
  const state = useCanvasStore.getState();
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node) return;
  const boxW = node.width ?? max.width;
  const boxH = node.height ?? max.height;
  state.updateNode(nodeId, {
    width: fitted.width,
    height: fitted.height,
    x: node.x + boxW / 2 - fitted.width / 2,
    y: node.y + boxH / 2 - fitted.height / 2,
  });
  state.updateNodeData(nodeId, {
    mediaWidth: natural.width,
    mediaHeight: natural.height,
  });
}
