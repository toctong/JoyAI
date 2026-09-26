import type { CanvasNode } from "@joyai/shared";

/** Download the media URL on a canvas node as a file. */
export async function downloadNodeMedia(node: CanvasNode) {
  const url = String(node.data.url ?? "").trim();
  if (!url || url.startsWith("data:")) return;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const preferred = String(node.data.fileName ?? "").trim();
    const fromMime =
      blob.type === "image/png"
        ? "png"
        : blob.type === "image/jpeg"
          ? "jpg"
          : blob.type === "image/webp"
            ? "webp"
            : blob.type.includes("mp4")
              ? "mp4"
              : blob.type.includes("webm")
                ? "webm"
                : blob.type.includes("audio")
                  ? "webm"
                  : "";
    const fromUrl = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1] ?? "";
    const ext =
      fromMime ||
      fromUrl ||
      (node.type === "video"
        ? "mp4"
        : node.type === "audio"
          ? "webm"
          : "png");
    a.download =
      preferred && !/\.[a-z0-9]{2,5}$/i.test(preferred)
        ? `${preferred}.${ext}`
        : preferred || `framerally-${node.type}-${node.id.slice(0, 6)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, "_blank");
  }
}
