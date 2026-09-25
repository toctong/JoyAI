/**
 * Aggregated prompt gallery (imageprompts.co-style filters).
 * Merges static open-source prompt libs; live Domer chips are included for
 * video models that lack a full-list JSON source.
 */

import type { ExploreFeedItem } from "./explore.types";
import { EXPLORE_UI_SOURCE_IDS, findPromptSource } from "./prompt-sources";
import { fetchPromptSourceFeed } from "./prompt-source-feed";

export type GalleryCategoryId =
  | "all"
  | "ads"
  | "posters"
  | "illustration"
  | "character"
  | "fashion"
  | "scene"
  | "portrait";

export type GalleryStyleId =
  | "all"
  | "realistic"
  | "cinematic"
  | "magazine"
  | "illustration"
  | "3d"
  | "anime"
  | "graphic"
  | "vintage";

export type GallerySortId = "trending" | "latest" | "popular";

export type GalleryModelId =
  | "all"
  | "gpt-image"
  | "nano-banana"
  | "midjourney"
  | "seedance"
  | "kling"
  | "gemini"
  | "grok"
  | "seedream"
  | "veo";

/** Sources merged per model family when browsing 提示词库. */
const MODEL_SOURCE_IDS: Record<Exclude<GalleryModelId, "all">, string[]> = {
  "gpt-image": ["youmind-gpt-image-2", "xianyu-awesome-gptimage2"],
  "nano-banana": ["youmind-nano-banana-pro", "youmind-gemini-3"],
  midjourney: [], // Elser-only; handled live in explore.service
  seedance: ["youmind-seedance-2", "ericgood-seedance", "domer-seedance"],
  kling: ["domer-kling"],
  gemini: ["youmind-gemini-3"],
  grok: ["youmind-grok-imagine", "domer-grok"],
  seedream: ["youmind-seedream-4.5"],
  veo: ["domer-veo"],
};

const CATEGORY_PATTERNS: Record<
  Exclude<GalleryCategoryId, "all">,
  RegExp
> = {
  ads: /广告|产品|商品|包装|commercial|product|skincare|护肤|电商|fmcg|bottle|品牌/i,
  posters: /海报|poster|visual|招贴|封面|campaign|kv\b|主视觉/i,
  illustration: /插画|illustration|水彩|watercolor|手绘|drawing|illustrat/i,
  character: /角色|character|人设|oc\b|ip\b|立绘|creature|mascot/i,
  fashion: /时尚|fashion|服装|模特|couture|穿搭|wardrobe|lookbook/i,
  scene: /场景|scene|风景|城市|建筑|landscape|cityscape|interior|环境/i,
  portrait: /人像|portrait|面部|头像|selfie|headshot|半身|写真/i,
};

const STYLE_PATTERNS: Record<Exclude<GalleryStyleId, "all">, RegExp> = {
  realistic: /写实|photoreal|realistic|摄影|超清|ultra[- ]?real/i,
  cinematic: /电影|cinematic|film still|镜头感|宽银幕/i,
  magazine: /杂志|editorial|magazine|vogue|时装大片/i,
  illustration: /插画|illustration|手绘|flat design/i,
  "3d": /\b3d\b|cgi|render|blender|octane|c4d/i,
  anime: /动漫|anime|二次元|漫画|manga|赛璐珞/i,
  graphic: /平面|graphic|infographic|排版|typography|海报设计/i,
  vintage: /复古|vintage|retro|怀旧|film grain/i,
};

const galleryListCache = new Map<
  string,
  { expiresAt: number; items: ExploreFeedItem[] }
>();

function galleryCacheTtlMs(): number {
  const raw = process.env.ELSER_FEED_CACHE_TTL_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 6 * 60 * 60 * 1000;
}

export function resolveGallerySourceIds(model: GalleryModelId): string[] {
  if (model === "all") {
    const ids = new Set<string>();
    for (const list of Object.values(MODEL_SOURCE_IDS)) {
      for (const id of list) {
        if (EXPLORE_UI_SOURCE_IDS.has(id) || findPromptSource(id)) {
          ids.add(id);
        }
      }
    }
    for (const id of [
      "youmind-gpt-image-2",
      "xianyu-awesome-gptimage2",
      "youmind-nano-banana-pro",
      "youmind-gemini-3",
      "youmind-seedream-4.5",
      "youmind-seedance-2",
      "ericgood-seedance",
      "youmind-grok-imagine",
    ]) {
      if (findPromptSource(id)) ids.add(id);
    }
    return [...ids];
  }
  return (MODEL_SOURCE_IDS[model] ?? []).filter((id) => findPromptSource(id));
}

/** Midjourney has no open prompt JSON — pull Elser model feed into the gallery. */
export function galleryNeedsElser(model: GalleryModelId): boolean {
  return model === "midjourney";
}

export async function fetchPromptGalleryFeed(params: {
  limit: number;
  cursor?: string;
  category?: string;
  model?: string;
  style?: string;
  sort?: string;
  /** Extra Elser midjourney (or all-model) items already mapped */
  elserItems?: ExploreFeedItem[];
  forceRefresh?: boolean;
}): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const limit = Math.max(1, Math.min(params.limit || 20, 48));
  const category = normalizeCategory(params.category);
  const model = normalizeModel(params.model);
  const style = normalizeStyle(params.style);
  const sort = normalizeSort(params.sort);
  const cacheKey = `gallery:${model}:${category}:${style}:${sort}`;

  let all: ExploreFeedItem[];
  if (!params.forceRefresh) {
    const hit = galleryListCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {
      all = hit.items;
      return pageSlice(all, limit, params.cursor);
    }
  }

  const sourceIds = resolveGallerySourceIds(model);
  const merged: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  await mapPool(sourceIds, 3, async (sourceId) => {
    const pageLimit = 48;
    let cursor: string | undefined;
    let pages = 0;
    const maxPages = sourceId.startsWith("domer") ? 3 : 1;
    while (pages < maxPages) {
      const page = await fetchPromptSourceFeed({
        sourceId,
        limit: pageLimit,
        cursor,
        forceRefresh: Boolean(params.forceRefresh) && pages === 0,
      });
      for (const item of page.items) {
        const id = String(item.id ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        merged.push(item);
      }
      pages += 1;
      if (!page.hasMore || !page.nextCursor?.trim()) break;
      cursor = page.nextCursor.trim();
      if (!sourceId.startsWith("domer")) break;
    }
  });

  for (const item of params.elserItems ?? []) {
    const id = String(item.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }

  let filtered = merged;
  if (category !== "all") {
    const re = CATEGORY_PATTERNS[category];
    filtered = filtered.filter((item) => matchHaystack(item, re));
  }
  if (style !== "all") {
    const re = STYLE_PATTERNS[style];
    filtered = filtered.filter((item) => matchHaystack(item, re));
  }

  filtered = sortItems(filtered, sort);

  galleryListCache.set(cacheKey, {
    expiresAt: Date.now() + galleryCacheTtlMs(),
    items: filtered,
  });

  return pageSlice(filtered, limit, params.cursor);
}

function matchHaystack(item: ExploreFeedItem, re: RegExp): boolean {
  const hay = [
    item.title,
    item.prompt,
    ...(item.tags ?? []),
    item.modelId ?? "",
  ]
    .join("\n")
    .toLowerCase();
  return re.test(hay);
}

function sortItems(
  items: ExploreFeedItem[],
  sort: GallerySortId,
): ExploreFeedItem[] {
  const copy = [...items];
  if (sort === "latest") {
    copy.sort((a, b) => createdMs(b) - createdMs(a));
    return copy;
  }
  if (sort === "popular") {
    copy.sort((a, b) => popularScore(b) - popularScore(a));
    return copy;
  }
  copy.sort((a, b) => trendingScore(b) - trendingScore(a));
  return copy;
}

function popularScore(item: ExploreFeedItem): number {
  return (
    (Number(item.likeCount) || 0) * 3 +
    (Number(item.recreateCount) || 0) * 2 +
    (Number(item.favoriteCount) || 0)
  );
}

function trendingScore(item: ExploreFeedItem): number {
  const ageHours = Math.max(
    1,
    (Date.now() - (createdMs(item) || Date.now())) / 3_600_000,
  );
  return (
    popularScore(item) / Math.pow(ageHours, 0.35) + popularScore(item) * 0.15
  );
}

function createdMs(item: ExploreFeedItem): number {
  const raw = item.createdAt?.trim();
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function pageSlice(
  all: ExploreFeedItem[],
  limit: number,
  cursor?: string,
): {
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
} {
  const offset = Math.max(0, Number.parseInt(String(cursor ?? "0"), 10) || 0);
  const slice = all.slice(offset, offset + limit);
  const next = offset + slice.length;
  const hasMore = next < all.length;
  return {
    items: slice,
    nextCursor: hasMore ? String(next) : null,
    hasMore,
  };
}

function normalizeCategory(raw?: string): GalleryCategoryId {
  const v = String(raw ?? "all").trim().toLowerCase();
  if (
    v === "ads" ||
    v === "posters" ||
    v === "illustration" ||
    v === "character" ||
    v === "fashion" ||
    v === "scene" ||
    v === "portrait"
  ) {
    return v;
  }
  return "all";
}

function normalizeModel(raw?: string): GalleryModelId {
  const v = String(raw ?? "all").trim().toLowerCase();
  if (
    v === "gpt-image" ||
    v === "nano-banana" ||
    v === "midjourney" ||
    v === "seedance" ||
    v === "kling" ||
    v === "gemini" ||
    v === "grok" ||
    v === "seedream" ||
    v === "veo"
  ) {
    return v;
  }
  return "all";
}

function normalizeStyle(raw?: string): GalleryStyleId {
  const v = String(raw ?? "all").trim().toLowerCase();
  if (
    v === "realistic" ||
    v === "cinematic" ||
    v === "magazine" ||
    v === "illustration" ||
    v === "3d" ||
    v === "anime" ||
    v === "graphic" ||
    v === "vintage"
  ) {
    return v;
  }
  return "all";
}

function normalizeSort(raw?: string): GallerySortId {
  const v = String(raw ?? "trending").trim().toLowerCase();
  if (v === "latest" || v === "popular") return v;
  return "trending";
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        await fn(items[i]!);
      }
    },
  );
  await Promise.all(workers);
}
