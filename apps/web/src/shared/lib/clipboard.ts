/** Collect File objects from a paste / clipboard DataTransfer. */
export function filesFromClipboardData(
  data: DataTransfer | null | undefined,
): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();

  const push = (file: File | null | undefined) => {
    if (!file || file.size <= 0) return;
    const key = `${file.type}:${file.size}:${file.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(normalizeClipboardFile(file, out.length));
  };

  if (data.items?.length) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      push(item.getAsFile());
    }
  }
  if (data.files?.length) {
    for (const file of Array.from(data.files)) push(file);
  }

  if (out.length === 0) {
    const html = data.getData?.("text/html") || "";
    const dataUrl = html.match(
      /<img[^>]+src=["'](data:image\/[a-zA-Z0-9+.-]+;base64,[^"']+)["']/i,
    )?.[1];
    if (dataUrl) {
      const file = fileFromDataUrl(dataUrl, out.length);
      if (file) out.push(file);
    }
  }

  return out;
}

/** Async read of image blobs via Clipboard API (fallback when paste DataTransfer is empty). */
export async function readClipboardImageFiles(): Promise<File[]> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.clipboard?.read !== "function"
  ) {
    return [];
  }
  try {
    const items = await navigator.clipboard.read();
    const out: File[] = [];
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      if (!blob || blob.size <= 0) continue;
      out.push(
        normalizeClipboardFile(
          new File([blob], "clipboard-image.png", { type: imageType }),
          out.length,
        ),
      );
    }
    return out;
  } catch {
    return [];
  }
}

function fileFromDataUrl(dataUrl: string, index: number): File | null {
  try {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return null;
    const type = match[1] || "image/png";
    const bin = atob(match[2] || "");
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return normalizeClipboardFile(
      new File([bytes], "clipboard-image.png", { type }),
      index,
    );
  } catch {
    return null;
  }
}

function normalizeClipboardFile(file: File, index: number): File {
  const name = (file.name || "").trim();
  if (name && name !== "blob" && name !== "image.png") return file;
  const subtype = (file.type.split("/")[1] || "png").split(";")[0] || "png";
  const safe =
    subtype === "jpeg" ? "jpg" : subtype.replace(/[^a-z0-9]+/gi, "") || "png";
  return new File([file], `clipboard-image-${index + 1}.${safe}`, {
    type: file.type || "image/png",
  });
}

/**
 * 复制文本到剪贴板。
 * 优先 Clipboard API；在非安全上下文 / 权限拒绝等场景回退到 textarea + execCommand。
 */
export async function copyText(text: string): Promise<boolean> {
  const value = text ?? "";
  if (!value) return false;

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.clipboard?.writeText === "function" &&
    (typeof window === "undefined" ||
      window.isSecureContext !== false)
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
    }
  }

  return copyTextFallback(value);
}

function copyTextFallback(text: string): boolean {
  if (typeof document === "undefined") return false;

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;outline:none;box-shadow:none;background:transparent;opacity:0;";
  document.body.appendChild(ta);

  const selection = document.getSelection();
  const ranges: Range[] = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      ranges.push(selection.getRangeAt(i));
    }
  }

  let ok = false;
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }

  return ok;
}
