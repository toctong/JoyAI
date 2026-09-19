/** Trigger a file download for a remote asset URL. */
export async function downloadAsset(
  url: string,
  kind?: string,
  fileName?: string,
) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    const ext = extForAsset(url, blob.type, kind);
    const preferred = String(fileName ?? "").trim();
    a.download =
      preferred && !/\.[a-z0-9]{2,5}$/i.test(preferred)
        ? `${preferred}.${ext}`
        : preferred || `joyai-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function extForAsset(url: string, mime: string, kind?: string) {
  if (kind === "video" || mime.startsWith("video/")) {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  const fromUrl = url.match(/\.(mp4|webm|mov|png|jpe?g|webp|gif)(?:\?|$)/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase().replace("jpeg", "jpg");
  return kind === "video" ? "mp4" : "png";
}
