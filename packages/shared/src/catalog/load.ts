import type { CatalogModel } from "./helpers";
import type { ModelCapabilities, ModelPricing } from "../model-meta";
import { defaultAdapterId } from "../adapters";
import { inferImageProtocol } from "../protocol";
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
  /** @deprecated Catalogs no longer include prices; kept for older JSON. */
  pricing?: ModelPricing;
  capabilities: ModelCapabilities;
  /** Override protocol adapter; else derived from catalog platform + kind. */
  adapterId?: string;
  isDefault?: boolean;
};

const KIND_BLOCKS = ["llm", "image", "video"] as const;

function syncResolutions(
  pricing: ModelPricing | undefined,
  capabilities: ModelCapabilities,
): ModelCapabilities {
  const tierResolutions = (pricing?.tiers ?? [])
    .map((t) => t.resolution ?? t.label)
    .filter((x): x is string => Boolean(x));
  if (!tierResolutions.length) return capabilities;
  const resolutions = [
    ...new Set([...(capabilities.resolutions ?? []), ...tierResolutions]),
  ];
  return resolutions.length
    ? { ...capabilities, resolutions }
    : capabilities;
}

function enrichCapabilities(
  platform: string,
  kind: (typeof KIND_BLOCKS)[number],
  remoteId: string,
  capabilities: ModelCapabilities,
  adapterId?: string,
): ModelCapabilities {
  let caps = { ...capabilities };
  if (adapterId) caps = { ...caps, adapterId };

  // Stamp inferred image protocol when catalog left it empty (still overridable).
  if (kind === "image" && !caps.protocol?.imageProfile) {
    const inferred = inferImageProtocol(platform, remoteId);
    caps = {
      ...caps,
      protocol: {
        ...inferred,
        ...caps.protocol,
        imageProfile: caps.protocol?.imageProfile ?? inferred.imageProfile,
        modelAlias: caps.protocol?.modelAlias ?? inferred.modelAlias,
        imagePath: caps.protocol?.imagePath ?? inferred.imagePath,
      },
    };
  }

  return caps;
}

/** Flatten `{ llm, image, video }` → CatalogModel[] with kind + adapterId. */
export function flattenChannelCatalog(
  doc: ChannelCatalogJson,
): CatalogModel[] {
  const out: CatalogModel[] = [];
  const platform = String(doc.platform || "").trim();
  for (const kind of KIND_BLOCKS) {
    for (const item of doc[kind] ?? []) {
      const baseCaps = syncResolutions(item.pricing, item.capabilities);
      const adapterId =
        item.adapterId?.trim() ||
        baseCaps.adapterId?.trim() ||
        defaultAdapterId(platform, kind) ||
        undefined;
      const capabilities = enrichCapabilities(
        platform,
        kind,
        item.remoteId,
        baseCaps,
        adapterId,
      );
      out.push({
        kind,
        name: item.name,
        remoteId: item.remoteId,
        description: item.description,
        pricing: item.pricing,
        capabilities,
        adapterId,
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
