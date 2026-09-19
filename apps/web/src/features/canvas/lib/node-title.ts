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

export function fileNameFromUrl(url: string) {
  try {
    const path = decodeURIComponent(new URL(url, "https://local").pathname);
    return baseName(path);
  } catch {
    return baseName(url);
  }
}

function clip(value: string, max = TITLE_MAX) {
  const text = value.trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Prefer the real file name; user rename (`titleManual`) wins. */
export function resolveMediaTitle(
  data: Record<string, unknown>,
  opts?: { fallback?: string },
): string {
  const custom = String(data.title ?? "").trim();
  if (data.titleManual === true && custom) return clip(custom);

  const fromFile = baseName(String(data.fileName ?? ""));
  if (fromFile && fromFile !== "upload") return clip(fromFile);

  const url = String(data.url ?? "");
  if (url && !url.startsWith("data:")) {
    const fromUrl = fileNameFromUrl(url);
    if (fromUrl && fromUrl !== "upload") return clip(fromUrl);
  }

  if (custom) return clip(custom);
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
