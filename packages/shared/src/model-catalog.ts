import { ProviderPlatform, type ProviderPlatformId } from "./model-meta";
import type { CatalogModel } from "./catalog/helpers";
import {
  CHANNEL_CATALOG_JSON,
  flattenChannelCatalog,
} from "./catalog/load";

export {
  USD_TO_CNY,
  usdToCny,
  type CatalogModel,
} from "./catalog/helpers";

export type {
  ChannelCatalogJson,
  CatalogModelJson,
} from "./catalog/load";

export const MODEL_CATALOG: Record<ProviderPlatformId, CatalogModel[]> = {
  [ProviderPlatform.VOLCENGINE]: flattenChannelCatalog(
    CHANNEL_CATALOG_JSON.volcengine!,
  ),
  [ProviderPlatform.APIMART]: flattenChannelCatalog(
    CHANNEL_CATALOG_JSON.apimart!,
  ),
  [ProviderPlatform.TOAPIS]: flattenChannelCatalog(
    CHANNEL_CATALOG_JSON.toapis!,
  ),
  [ProviderPlatform.DASHSCOPE]: flattenChannelCatalog(
    CHANNEL_CATALOG_JSON.dashscope!,
  ),
};

export function getCatalogForPlatform(platform: string): CatalogModel[] {
  return MODEL_CATALOG[platform as ProviderPlatformId] ?? [];
}

export function catalogStats() {
  return Object.fromEntries(
    Object.entries(MODEL_CATALOG).map(([k, v]) => [
      k,
      {
        total: v.length,
        llm: v.filter((m) => m.kind === "llm").length,
        image: v.filter((m) => m.kind === "image").length,
        video: v.filter((m) => m.kind === "video").length,
      },
    ]),
  );
}
