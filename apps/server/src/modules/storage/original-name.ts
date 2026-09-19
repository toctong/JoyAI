/** Content-addressed keys look like `<md5>.ext` — never treat as display names. */
export function isStorageHashName(name: string) {
  const stem = name.replace(/\.[^.]+$/, "");
  return /^[a-f0-9]{32}$/i.test(stem) || /^[a-f0-9]{64}$/i.test(stem);
}

/** Keep only a safe basename for display / download (storage key stays content-hashed). */
export function sanitizeOriginalName(raw?: string | null): string | undefined {
  const base = String(raw ?? "")
    .trim()
    .split(/[/\\]/)
    .pop()
    ?.trim();
  if (!base || base === "." || base === "..") return undefined;
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
  if (!cleaned || isStorageHashName(cleaned)) return undefined;
  return cleaned;
}

export function originalNameFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string | undefined {
  const value = meta?.originalName;
  return typeof value === "string" ? sanitizeOriginalName(value) : undefined;
}
