import type { CanvasNodeType } from "@joyai/shared";

function loadImageRatio(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Map an uploaded file to a canvas node. 2:1 images become panoramas. */
export async function nodeTypeForUpload(
  file: File,
  kind: string,
): Promise<CanvasNodeType> {
  if (kind === "video" || file.type.startsWith("video/")) return "video";
  if (kind === "audio" || file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/") || kind === "image") {
    const ratio = await loadImageRatio(file);
    if (ratio != null && Math.abs(ratio - 2) < 0.06) return "panorama";
  }
  return "image";
}

export function nodeTypeForAssetKind(kind: string): CanvasNodeType {
  if (kind === "video") return "video";
  if (kind === "audio") return "audio";
  return "image";
}

/** Probe remote image URL aspect; ~2:1 → panorama. */
export function probeImageUrlType(url: string): Promise<"image" | "panorama"> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (type: "image" | "panorama") => resolve(type);
    img.onload = () => {
      const ratio =
        img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 0;
      done(Math.abs(ratio - 2) < 0.06 ? "panorama" : "image");
    };
    img.onerror = () => done("image");
    img.src = url;
  });
}
