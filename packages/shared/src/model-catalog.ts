import { ProviderPlatform, type ProviderPlatformId } from "./model-meta";
import type { CatalogModel } from "./catalog/helpers";
import { APIMART_CATALOG } from "./catalog/apimart";
import { DASHSCOPE_CATALOG } from "./catalog/dashscope";
import { TOAPIS_CATALOG } from "./catalog/toapis";
import { VOLCENGINE_CATALOG } from "./catalog/volcengine";

export {
  USD_TO_CNY,
  usdToCny,
  type CatalogModel,
} from "./catalog/helpers";

export const MODEL_CATALOG: Record<ProviderPlatformId, CatalogModel[]> = {
  [ProviderPlatform.VOLCENGINE]: VOLCENGINE_CATALOG,
  [ProviderPlatform.APIMART]: APIMART_CATALOG,
  [ProviderPlatform.TOAPIS]: TOAPIS_CATALOG,
  [ProviderPlatform.DASHSCOPE]: DASHSCOPE_CATALOG,
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
