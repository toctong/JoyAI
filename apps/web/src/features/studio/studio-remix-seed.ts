/** Cross-route seed for explore 「一键同款」/ tools 「去生图」→ /studio. */

export type StudioRemixSeed = {
  prompt: string;
  /** Remote reference media URLs (image / video / audio). */
  refs: string[];
  type?: "image" | "video";
};

const STORAGE_KEY = "joyai:studio-remix-seed";
const MAX_AGE_MS = 5 * 60 * 1000;

export function writeStudioRemixSeed(seed: StudioRemixSeed) {
  if (typeof window === "undefined") return;
  const payload = {
    ...seed,
    prompt: String(seed.prompt ?? "").trim(),
    refs: (seed.refs ?? []).map((u) => String(u || "").trim()).filter(Boolean),
    at: Date.now(),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
}

/** Read and clear one-shot remix seed. */
export function consumeStudioRemixSeed(): StudioRemixSeed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as StudioRemixSeed & { at?: number };
    if (
      typeof parsed.at === "number" &&
      Date.now() - parsed.at > MAX_AGE_MS
    ) {
      return null;
    }
    const prompt = String(parsed.prompt ?? "").trim();
    const refs = Array.isArray(parsed.refs)
      ? parsed.refs.map((u) => String(u || "").trim()).filter(Boolean)
      : [];
    if (!prompt && refs.length === 0) return null;
    const type =
      parsed.type === "video" || parsed.type === "image"
        ? parsed.type
        : undefined;
    return {
      prompt,
      refs,
      type,
    };
  } catch {
    return null;
  }
}
