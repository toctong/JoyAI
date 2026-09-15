import type { ModelCapabilities, ModelPricing } from "../model-meta";

export const USD_TO_CNY = 7.2;

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
