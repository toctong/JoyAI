import type { CatalogModel } from "./helpers";
import type { ModelCapabilities, ModelPricing } from "../model-meta";
import volcengine from "./volcengine.json";
import dashscope from "./dashscope.json";
import apimart from "./apimart.json";
import toapis from "./toapis.json";

/** One channel catalog JSON: three blocks for easy editing. */
export type ChannelCatalogJson = {
  platform: string;
  updatedAt?: string;
  note?: string;
  llm?: CatalogModelJson[];
  image?: CatalogModelJson[];
  video?: CatalogModelJson[];
};

/** Model entry inside a kind block — `kind` comes from the block name. */
export type CatalogModelJson = {
  name: string;
  remoteId: string;
  description?: string;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};

const KIND_BLOCKS = ["llm", "image", "video"] as const;

function syncResolutions(
  pricing: ModelPricing,
  capabilities: ModelCapabilities,
): ModelCapabilities {
  const tierResolutions = (pricing.tiers ?? [])
    .map((t) => t.resolution ?? t.label)
    .filter((x): x is string => Boolean(x));
  const resolutions = [
    ...new Set([...(capabilities.resolutions ?? []), ...tierResolutions]),
  ];
  return resolutions.length
    ? { ...capabilities, resolutions }
    : capabilities;
}

/** Flatten `{ llm, image, video }` → CatalogModel[] with kind injected. */
export function flattenChannelCatalog(
  doc: ChannelCatalogJson,
): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const kind of KIND_BLOCKS) {
    for (const item of doc[kind] ?? []) {
      out.push({
        kind,
        name: item.name,
        remoteId: item.remoteId,
        description: item.description,
        pricing: item.pricing,
        capabilities: syncResolutions(item.pricing, item.capabilities),
        isDefault: item.isDefault,
      });
    }
  }
  return out;
}

export const CHANNEL_CATALOG_JSON: Record<string, ChannelCatalogJson> = {
  volcengine: volcengine as ChannelCatalogJson,
  dashscope: dashscope as ChannelCatalogJson,
  apimart: apimart as ChannelCatalogJson,
  toapis: toapis as ChannelCatalogJson,
};
