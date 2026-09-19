/**
 * Protocol adapter ids — business code routes by adapterId, not platform.
 * Same protocol family (e.g. OpenAI-compatible images) shares one implementation;
 * platform only supplies credentials / baseUrl.
 */
export const AdapterId = {
  OPENAI_IMAGES: "openai-images",
  OPENAI_VIDEOS: "openai-videos",
  OPENAI_CHAT: "openai-chat",
  ARK_IMAGES: "ark-images",
  ARK_VIDEO: "ark-video",
  DASHSCOPE_IMAGES: "dashscope-images",
  DASHSCOPE_VIDEO: "dashscope-video",
} as const;

export type AdapterIdValue = (typeof AdapterId)[keyof typeof AdapterId];

const ALL_ADAPTERS = new Set<string>(Object.values(AdapterId));

export function isAdapterId(value: string): value is AdapterIdValue {
  return ALL_ADAPTERS.has(value);
}

/** Default adapter when catalog entry omits adapterId. */
export function defaultAdapterId(
  platform: string,
  kind: "image" | "video" | "llm",
): AdapterIdValue | null {
  const p = platform.trim().toLowerCase();
  if (kind === "llm") {
    // Most channels expose OpenAI-compatible /v1/chat/completions
    if (
      p === "apimart" ||
      p === "toapis" ||
      p === "openai-compatible" ||
      p === "volcengine" ||
      p === "dashscope"
    ) {
      return AdapterId.OPENAI_CHAT;
    }
    return AdapterId.OPENAI_CHAT;
  }
  if (kind === "image") {
    if (p === "volcengine") return AdapterId.ARK_IMAGES;
    if (p === "dashscope") return AdapterId.DASHSCOPE_IMAGES;
    if (p === "apimart" || p === "toapis" || p === "openai-compatible") {
      return AdapterId.OPENAI_IMAGES;
    }
  }
  if (kind === "video") {
    if (p === "volcengine") return AdapterId.ARK_VIDEO;
    if (p === "dashscope") return AdapterId.DASHSCOPE_VIDEO;
    if (p === "apimart" || p === "toapis" || p === "openai-compatible") {
      return AdapterId.OPENAI_VIDEOS;
    }
  }
  return null;
}

/**
 * Resolve runtime adapter:
 * 1) explicit adapterId on model / capabilities
 * 2) platform + kind default
 */
export function resolveAdapterId(opts: {
  platform: string;
  kind: "image" | "video" | "llm";
  adapterId?: string | null;
  capabilities?: { adapterId?: unknown } | null;
}): AdapterIdValue {
  const raw =
    (opts.adapterId && String(opts.adapterId).trim()) ||
    (opts.capabilities?.adapterId != null
      ? String(opts.capabilities.adapterId).trim()
      : "");
  if (raw && isAdapterId(raw)) return raw;

  const fallback = defaultAdapterId(opts.platform, opts.kind);
  if (fallback) return fallback;

  throw new Error(
    `No adapter for platform=${opts.platform} kind=${opts.kind}` +
      (raw ? ` (unknown adapterId=${raw})` : ""),
  );
}
