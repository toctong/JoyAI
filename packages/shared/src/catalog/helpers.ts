import type { ModelCapabilities, ModelPricing } from "../model-meta";

export const USD_TO_CNY = 7.2;
export const AGG_NOTE = `中转参考价（美元×${USD_TO_CNY}），以控制台实付为准`;
export const OFFICIAL_NOTE = "官方公开参考价，以控制台为准";
export const CATALOG_UPDATED = "2026-09-14";

export type CatalogModel = {
  name: string;
  kind: "image" | "video" | "llm";
  remoteId: string;
  description?: string;
  pricing: ModelPricing;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
};

export function usdToCny(usd: number, digits = 4): number {
  return Number((usd * USD_TO_CNY).toFixed(digits));
}

export function tokenPrice(
  inputPer1M: number,
  outputPer1M: number,
  note = AGG_NOTE,
): ModelPricing {
  return {
    currency: "CNY",
    billing: "token",
    inputPer1M,
    outputPer1M,
    note,
    updatedAt: CATALOG_UPDATED,
  };
}

export function imagePrice(
  perImage: number,
  note = AGG_NOTE,
  tiers?: ModelPricing["tiers"],
): ModelPricing {
  return {
    currency: "CNY",
    billing: tiers?.length ? "tiered" : "per_image",
    perImage,
    tiers,
    note,
    updatedAt: CATALOG_UPDATED,
  };
}

export function videoSecond(
  perSecond: number,
  note = AGG_NOTE,
  tiers?: ModelPricing["tiers"],
): ModelPricing {
  return {
    currency: "CNY",
    billing: tiers?.length ? "tiered" : "per_second",
    perSecond,
    tiers,
    note,
    updatedAt: CATALOG_UPDATED,
  };
}

export function videoPerClip(
  perVideo: number,
  note = AGG_NOTE,
  tiers?: ModelPricing["tiers"],
): ModelPricing {
  return {
    currency: "CNY",
    billing: tiers?.length ? "tiered" : "per_video",
    perVideo,
    tiers,
    note,
    updatedAt: CATALOG_UPDATED,
  };
}

export const llmText = (features: string[] = []): ModelCapabilities => ({
  input: ["text"],
  output: ["text"],
  features: ["chat", ...features],
});

export const llmVision = (features: string[] = []): ModelCapabilities => ({
  input: ["text", "image"],
  output: ["text"],
  features: ["chat", "vision", ...features],
});

export const t2i = (
  extra?: Partial<ModelCapabilities>,
): ModelCapabilities => ({
  input: ["text"],
  output: ["image"],
  features: ["t2i"],
  async: true,
  ...extra,
});

export const i2i = (
  maxRefImages = 4,
  extra?: Partial<ModelCapabilities>,
): ModelCapabilities => ({
  input: ["text", "image"],
  output: ["image"],
  maxRefImages,
  features: ["t2i", "i2i"],
  async: true,
  ...extra,
});

export const t2v = (
  extra?: Partial<ModelCapabilities>,
): ModelCapabilities => ({
  input: ["text"],
  output: ["video"],
  async: true,
  features: ["t2v"],
  ...extra,
});

export const i2v = (
  maxRefImages = 1,
  extra?: Partial<ModelCapabilities>,
): ModelCapabilities => ({
  input: ["text", "image"],
  output: ["video"],
  maxRefImages,
  async: true,
  features: ["t2v", "i2v"],
  ...extra,
});

/** Compact factory — syncs resolution labels from pricing tiers into capabilities. */
export function m(
  kind: CatalogModel["kind"],
  name: string,
  remoteId: string,
  pricing: ModelPricing,
  capabilities: ModelCapabilities,
  extra?: Partial<CatalogModel>,
): CatalogModel {
  const tierResolutions = (pricing.tiers ?? [])
    .map((t) => t.resolution ?? t.label)
    .filter(Boolean);
  const resolutions = [
    ...new Set([...(capabilities.resolutions ?? []), ...tierResolutions]),
  ];
  return {
    kind,
    name,
    remoteId,
    pricing,
    capabilities: {
      ...capabilities,
      ...(resolutions.length ? { resolutions } : {}),
    },
    ...extra,
  };
}

