/** Convert a data URL / blob URL into a File for Asset upload. */
export async function dataUrlToFile(
  dataUrl: string,
  filename = "canvas-edit.png",
): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const type = blob.type || "image/png";
  const ext = type.includes("jpeg") || type.includes("jpg") ? "jpg" : "png";
  const name = filename.endsWith(".png") || filename.endsWith(".jpg")
    ? filename
    : `${filename}.${ext}`;
  return new File([blob], name, { type });
}

export function isDataUrl(url: string) {
  return url.startsWith("data:");
}
