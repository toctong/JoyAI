import { AdapterId, ProviderPlatform, resolveAdapterId } from "@joyai/shared";
import type {
  AudioProvider,
  ImageProvider,
  LlmProvider,
  VideoProvider,
} from "./types";
import {
  VolcengineImageProvider,
  VolcengineVideoProvider,
} from "./volcengine";
import {
  OpenAICompatibleImageProvider,
  OpenAICompatibleVideoProvider,
} from "./openai-compatible";
import { OpenAICompatibleLlmProvider } from "./openai-chat";
import { OpenAICompatibleAudioProvider } from "./openai-audio";
import { DashscopeVideoProvider } from "./dashscope-video";
import { DashscopeImageProvider } from "./dashscope-image";
import { DashscopeAudioProvider } from "./dashscope-audio";
import { VolcengineAudioProvider } from "./volcengine-audio";

export * from "./types";
export * from "./error-codes";
export * from "./http-error";
export * from "./image-size";
export * from "./param-map";
export * from "./prompt-mentions";
export * from "./volcengine";
export * from "./openai-compatible";
export * from "./openai-chat";
export * from "./openai-audio";
export * from "./dashscope-video";
export * from "./dashscope-image";
export * from "./dashscope-audio";
export * from "./volcengine-audio";

const arkImages = new VolcengineImageProvider();
const arkVideo = new VolcengineVideoProvider();
const dashscopeImages = new DashscopeImageProvider();
const dashscopeVideo = new DashscopeVideoProvider();
const dashscopeAudio = new DashscopeAudioProvider();
const volcengineAudio = new VolcengineAudioProvider();

const openaiImageCache = new Map<string, ImageProvider>();
const openaiVideoCache = new Map<string, VideoProvider>();
const openaiLlmCache = new Map<string, LlmProvider>();
const openaiAudioCache = new Map<string, AudioProvider>();

function openaiImagesFor(platform: string): ImageProvider {
  const key = platform || "openai-compatible";
  let hit = openaiImageCache.get(key);
  if (!hit) {
    hit = new OpenAICompatibleImageProvider(key);
    openaiImageCache.set(key, hit);
  }
  return hit;
}

function openaiVideosFor(platform: string): VideoProvider {
  const key = platform || "openai-compatible";
  let hit = openaiVideoCache.get(key);
  if (!hit) {
    hit = new OpenAICompatibleVideoProvider(key);
    openaiVideoCache.set(key, hit);
  }
  return hit;
}

function openaiLlmFor(platform: string): LlmProvider {
  const key = platform || "openai-compatible";
  let hit = openaiLlmCache.get(key);
  if (!hit) {
    hit = new OpenAICompatibleLlmProvider(key);
    openaiLlmCache.set(key, hit);
  }
  return hit;
}

function openaiAudioFor(platform: string): AudioProvider {
  const key = platform || "openai-compatible";
  let hit = openaiAudioCache.get(key);
  if (!hit) {
    hit = new OpenAICompatibleAudioProvider(key);
    openaiAudioCache.set(key, hit);
  }
  return hit;
}

/**
 * Resolve protocol adapter then provider.
 * OpenAI-compatible family still needs channel platform for body dialects
 * (APIMart vs ToAPIs); others are singleton adapters.
 */
export function resolveImageProvider(opts: {
  platform: string;
  adapterId?: string | null;
  capabilities?: { adapterId?: unknown } | null;
}): ImageProvider {
  const id = resolveAdapterId({
    platform: opts.platform,
    kind: "image",
    adapterId: opts.adapterId,
    capabilities: opts.capabilities,
  });
  if (id === AdapterId.OPENAI_IMAGES) {
    return openaiImagesFor(opts.platform);
  }
  if (id === AdapterId.ARK_IMAGES) return arkImages;
  if (id === AdapterId.DASHSCOPE_IMAGES) return dashscopeImages;
  throw new Error(`Unknown image adapter: ${id}`);
}

export function resolveVideoProvider(opts: {
  platform: string;
  adapterId?: string | null;
  capabilities?: { adapterId?: unknown } | null;
}): VideoProvider {
  const id = resolveAdapterId({
    platform: opts.platform,
    kind: "video",
    adapterId: opts.adapterId,
    capabilities: opts.capabilities,
  });
  if (id === AdapterId.OPENAI_VIDEOS) {
    return openaiVideosFor(opts.platform);
  }
  if (id === AdapterId.ARK_VIDEO) return arkVideo;
  if (id === AdapterId.DASHSCOPE_VIDEO) return dashscopeVideo;
  throw new Error(`Unknown video adapter: ${id}`);
}

export function resolveLlmProvider(opts: {
  platform: string;
  adapterId?: string | null;
  capabilities?: { adapterId?: unknown } | null;
}): LlmProvider {
  const id = resolveAdapterId({
    platform: opts.platform,
    kind: "llm",
    adapterId: opts.adapterId,
    capabilities: opts.capabilities,
  });
  if (id === AdapterId.OPENAI_CHAT) {
    return openaiLlmFor(opts.platform);
  }
  throw new Error(`Unknown llm adapter: ${id}`);
}

export function resolveAudioProvider(opts: {
  platform: string;
  adapterId?: string | null;
  capabilities?: { adapterId?: unknown } | null;
}): AudioProvider {
  const id = resolveAdapterId({
    platform: opts.platform,
    kind: "audio",
    adapterId: opts.adapterId,
    capabilities: opts.capabilities,
  });
  if (id === AdapterId.OPENAI_AUDIO) {
    return openaiAudioFor(opts.platform);
  }
  if (id === AdapterId.DASHSCOPE_AUDIO) return dashscopeAudio;
  if (id === AdapterId.VOLCENGINE_AUDIO) return volcengineAudio;
  throw new Error(`Unknown audio adapter: ${id}`);
}

/** Look up by adapter id only (OpenAI family uses generic dialect). */
export function getImageProvider(adapterId: string): ImageProvider {
  if (adapterId === AdapterId.OPENAI_IMAGES) {
    return openaiImagesFor("openai-compatible");
  }
  if (adapterId === AdapterId.ARK_IMAGES) return arkImages;
  if (adapterId === AdapterId.DASHSCOPE_IMAGES) return dashscopeImages;
  throw new Error(`Unknown image adapter: ${adapterId}`);
}

export function getVideoProvider(adapterId: string): VideoProvider {
  if (adapterId === AdapterId.OPENAI_VIDEOS) {
    return openaiVideosFor("openai-compatible");
  }
  if (adapterId === AdapterId.ARK_VIDEO) return arkVideo;
  if (adapterId === AdapterId.DASHSCOPE_VIDEO) return dashscopeVideo;
  throw new Error(`Unknown video adapter: ${adapterId}`);
}

export function getLlmProvider(adapterId: string): LlmProvider {
  if (adapterId === AdapterId.OPENAI_CHAT) {
    return openaiLlmFor("openai-compatible");
  }
  throw new Error(`Unknown llm adapter: ${adapterId}`);
}

export function getAudioProvider(adapterId: string): AudioProvider {
  if (adapterId === AdapterId.OPENAI_AUDIO) {
    return openaiAudioFor("openai-compatible");
  }
  if (adapterId === AdapterId.DASHSCOPE_AUDIO) return dashscopeAudio;
  if (adapterId === AdapterId.VOLCENGINE_AUDIO) return volcengineAudio;
  throw new Error(`Unknown audio adapter: ${adapterId}`);
}

/** @deprecated Use resolveImageProvider */
export function getImageProviderByPlatform(platform: string): ImageProvider {
  return resolveImageProvider({ platform });
}

/** @deprecated Use resolveVideoProvider */
export function getVideoProviderByPlatform(platform: string): VideoProvider {
  return resolveVideoProvider({ platform });
}

export const KNOWN_PLATFORMS = Object.values(ProviderPlatform);
