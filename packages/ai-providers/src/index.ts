import { ProviderPlatform } from "@joyai/shared";
import type { ImageProvider, VideoProvider } from "./types";
import {
  VolcengineImageProvider,
  VolcengineVideoProvider,
} from "./volcengine";

export * from "./types";
export * from "./volcengine";

const imageProviders: Record<string, ImageProvider> = {
  [ProviderPlatform.VOLCENGINE]: new VolcengineImageProvider(),
};

const videoProviders: Record<string, VideoProvider> = {
  [ProviderPlatform.VOLCENGINE]: new VolcengineVideoProvider(),
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
