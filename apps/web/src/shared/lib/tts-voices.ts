import { api } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";

/** Public TTS voice from GET /voices (admin 音色库). */
export type PublicTtsVoice = {
  id: string;
  slug: string;
  label: string;
  voiceId: string;
  channelId?: string | null;
  provider: string;
  gender?: string | null;
  language?: string | null;
  category?: string;
  description?: string | null;
  previewAudioUrl?: string | null;
  sortOrder?: number;
};

/** Resolve relative/CDN preview URLs for playback or node src. */
export function resolveTtsPreviewUrl(url?: string | null) {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

export type VoiceChipOption = {
  /** Provider speaker id submitted as job `voice` */
  value: string;
  label: string;
  previewAudioUrl?: string | null;
  fromLibrary: boolean;
};

export function ttsProviderFromPlatform(platform?: string | null) {
  const p = (platform ?? "").trim().toLowerCase();
  if (p === "dashscope") return "dashscope";
  if (p === "volcengine") return "volcengine";
  if (p === "openai" || p === "openai-compatible" || p === "custom") {
    return "openai";
  }
  return p || "";
}

/** Prefer channel-bound library voices, then same provider, then all library. */
export function pickLibraryVoices(
  library: PublicTtsVoice[],
  opts?: { channelId?: string | null; platform?: string | null },
): PublicTtsVoice[] {
  if (!library.length) return [];
  const channelId = opts?.channelId?.trim();
  if (channelId) {
    const byChannel = library.filter((v) => v.channelId === channelId);
    if (byChannel.length) return byChannel;
  }
  const provider = ttsProviderFromPlatform(opts?.platform);
  if (provider) {
    const byProvider = library.filter(
      (v) => (v.provider || "").toLowerCase() === provider,
    );
    if (byProvider.length) return byProvider;
  }
  return library;
}

export function libraryToVoiceChips(
  library: PublicTtsVoice[],
): VoiceChipOption[] {
  return library.map((v) => ({
    value: v.voiceId,
    label: v.label || v.voiceId,
    previewAudioUrl: v.previewAudioUrl ?? null,
    fromLibrary: true,
  }));
}

export function fallbackVoiceChips(names: string[]): VoiceChipOption[] {
  return names.filter(Boolean).map((name) => ({
    value: name,
    label: name,
    previewAudioUrl: null,
    fromLibrary: false,
  }));
}

export async function fetchPublicTtsVoices(opts?: {
  provider?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  if (opts?.provider?.trim()) params.set("provider", opts.provider.trim());
  if (opts?.category?.trim()) params.set("category", opts.category.trim());
  const qs = params.toString();
  return api<PublicTtsVoice[]>(`/voices${qs ? `?${qs}` : ""}`);
}
