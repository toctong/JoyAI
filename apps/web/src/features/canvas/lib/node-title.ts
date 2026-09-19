/** Build a display title from prompt / filename (infinite-canvas style). */

const TITLE_MAX = 52;

function collapseWs(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/** Underscore slug for latin-heavy prompts; keep readable CJK otherwise. */
export function titleFromPrompt(prompt: string, max = TITLE_MAX): string {
  const one = collapseWs(prompt);
  if (!one) return "";
  const chars = [...one];
  const ascii = chars.filter((c) => /[a-zA-Z0-9]/.test(c)).length;
  if (ascii / chars.length >= 0.45) {
    const slug = one
      .replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (!slug) return one.slice(0, max);
    return slug.length > max ? `${slug.slice(0, max)}…` : slug;
  }
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

function baseName(value: string) {
  const text = value.trim().split("?")[0]?.split("#")[0] ?? "";
  const name = text.split(/[/\\]/).pop()?.trim() ?? "";
  return name;
}

/** Content-addressed storage keys look like `<md5>.<ext>` — never show as titles. */
export function isStorageHashName(name: string) {
  const stem = baseName(name).replace(/\.[^.]+$/, "");
  return /^[a-f0-9]{32}$/i.test(stem) || /^[a-f0-9]{64}$/i.test(stem);
}

export function fileNameFromUrl(url: string) {
  try {
    const path = decodeURIComponent(new URL(url, "https://local").pathname);
    const name = baseName(path);
    if (!name || isStorageHashName(name) || /\/by-hash\//i.test(path)) {
      return "";
    }
    return name;
  } catch {
    const name = baseName(url);
    return name && !isStorageHashName(name) ? name : "";
  }
}

function clip(value: string, max = TITLE_MAX) {
  const text = value.trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Readable file name from upload File / asset meta / node data. */
export function originalNameFromAsset(asset: {
  meta?: Record<string, unknown> | null;
  originalName?: string | null;
  url?: string;
}): string {
  const direct = String(asset.originalName ?? "").trim();
  if (direct && !isStorageHashName(direct)) return baseName(direct);
  const metaName = String(asset.meta?.originalName ?? "").trim();
  if (metaName && !isStorageHashName(metaName)) return baseName(metaName);
  if (asset.url) return fileNameFromUrl(asset.url);
  return "";
}

/** Node data patch when we know the real client filename. */
export function mediaNamePatch(fileName: string): {
  fileName?: string;
  title?: string;
} {
  const name = baseName(fileName);
  if (!name || name === "upload" || isStorageHashName(name)) return {};
  const stem = name.replace(/\.[^.]+$/, "").trim();
  return {
    fileName: name,
    ...(stem ? { title: stem.slice(0, 80) } : {}),
  };
}

/** Prefer the real file name; user rename (`titleManual`) wins. */
export function resolveMediaTitle(
  data: Record<string, unknown>,
  opts?: { fallback?: string },
): string {
  const custom = String(data.title ?? "").trim();
  if (data.titleManual === true && custom) return clip(custom);

  const fromFile = baseName(String(data.fileName ?? ""));
  if (fromFile && fromFile !== "upload" && !isStorageHashName(fromFile)) {
    return clip(fromFile);
  }

  const url = String(data.url ?? "");
  if (url && !url.startsWith("data:")) {
    const fromUrl = fileNameFromUrl(url);
    if (fromUrl && fromUrl !== "upload") return clip(fromUrl);
  }

  if (custom && !isStorageHashName(custom)) return clip(custom);
  const fromPrompt = titleFromPrompt(String(data.prompt ?? ""));
  if (fromPrompt) return fromPrompt;
  return opts?.fallback ?? "";
}

/** Only fill title when the node does not already have a custom name. */
export function titlePatchIfEmpty(
  data: Record<string, unknown>,
  candidate: string,
): { title?: string } {
  if (String(data.title ?? "").trim()) return {};
  const next = collapseWs(candidate).slice(0, 80);
  return next ? { title: next } : {};
}
