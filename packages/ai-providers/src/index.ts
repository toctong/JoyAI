import { ProviderPlatform } from "@joyai/shared";
import type { ImageProvider, VideoProvider } from "./types";
import {
  VolcengineImageProvider,
  VolcengineVideoProvider,
} from "./volcengine";
import {
  OpenAICompatibleImageProvider,
  OpenAICompatibleVideoProvider,
} from "./openai-compatible";
import { DashscopeVideoProvider } from "./dashscope-video";

export * from "./types";
export * from "./volcengine";
export * from "./openai-compatible";
export * from "./dashscope-video";

const openaiImage = (platform: string) =>
  new OpenAICompatibleImageProvider(platform);
const openaiVideo = (platform: string) =>
  new OpenAICompatibleVideoProvider(platform);

const imageProviders: Record<string, ImageProvider> = {
  [ProviderPlatform.VOLCENGINE]: new VolcengineImageProvider(),
  [ProviderPlatform.APIMART]: openaiImage(ProviderPlatform.APIMART),
  [ProviderPlatform.TOAPIS]: openaiImage(ProviderPlatform.TOAPIS),
  [ProviderPlatform.DASHSCOPE]: openaiImage(ProviderPlatform.DASHSCOPE),
};

const videoProviders: Record<string, VideoProvider> = {
  [ProviderPlatform.VOLCENGINE]: new VolcengineVideoProvider(),
  [ProviderPlatform.APIMART]: openaiVideo(ProviderPlatform.APIMART),
  [ProviderPlatform.TOAPIS]: openaiVideo(ProviderPlatform.TOAPIS),
  [ProviderPlatform.DASHSCOPE]: new DashscopeVideoProvider(),
};

export function getImageProvider(platform: string): ImageProvider {
  const provider = imageProviders[platform];
  if (!provider) throw new Error(`Unknown image provider: ${platform}`);
  return provider;
}

export function getVideoProvider(platform: string): VideoProvider {
  const provider = videoProviders[platform];
  if (!provider) throw new Error(`Unknown video provider: ${platform}`);
  return provider;
}
