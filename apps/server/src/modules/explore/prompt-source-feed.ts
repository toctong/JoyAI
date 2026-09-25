import axios from "axios";
import type { ExploreFeedItem } from "./explore.types";
import {
  findPromptSource,
  PROMPT_SOURCES,
  type PromptSourceDef,
} from "./prompt-sources";
import {
  invalidateMarketProxy,
  isMarketProxyHost,
  marketProxyAxiosConfig,
} from "./explore-market-proxy";

const FETCH_TIMEOUT_MS = 45_000;
const UA = "FrameRally/0.1 (+explore-prompt-sources)";

const TIGER_CASE_FILES = [
  "cases/ad-creative.md",
  "cases/character.md",
  "cases/comparison.md",
  "cases/ecommerce.md",
  "cases/portrait.md",
  "cases/poster.md",
  "cases/ui.md",
];

type YukkcatRaw = {
  id?: string;
  title?: string;
  prompt?: string;
  coverUrl?: string;
  referenceImageUrls?: string[];
  tags?: string[];
  author?: string;
  sourceUrl?: string;
  createdAt?: string;
  imageModel?: string;
};

type XianyuItem = {
  x_url?: string;
  url?: string;
  author?: string;
  created_at?: string;
  prompt?: string;
  reason?: string;
  image_urls?: string[];
  primary_image_url?: string;
  like_count?: number | null;
  view_count?: number | null;
  engagement_score?: number | null;
};

type DavidWuItem = {
  id?: number | string;
  title_en?: string;
  title_cn?: string;
  category?: string;
  category_cn?: string;
  prompt?: string;
  author?: string;
  image?: string;
};

type TigerRecord = {
  title?: string;
  tweet_url?: string;
  image_dir?: string;
  category?: string;
  author_handle?: string;
  added_at?: string;
};

type TigerCase = { prompt: string; image: string };

export function listPromptSources() {
  return PROMPT_SOURCES.map(({ id, label, homepage, media }) => ({
    id,
    label,
    homepage,
    media,
  }));
}

export async function fetchPromptSourceFeed(params: {
  sourceId: string;
  limit: number;
  cursor?: string;
  /** Bypass in-memory full-list cache (warmer / forced refresh). */
  forceRefresh?: boolean;
}): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const def = findPromptSource(params.sourceId);
  if (!def) {
    throw new Error(`unknown prompt source: ${params.sourceId}`);
  }

  if (def.kind === "domer-explore") {
    return loadDomerPage(def, params.limit, params.cursor);
  }
  if (def.kind === "civitai-models") {
    return loadCivitaiModelsPage(def, params.limit, params.cursor);
  }
  if (def.kind === "pixai-market") {
    return loadPixaiMarketPage(def, params.limit, params.cursor);
  }

  const all = await loadAllItems(def, Boolean(params.forceRefresh));
  const offset = parseOffset(params.cursor);
  const slice = all.slice(offset, offset + params.limit);
  const next = offset + slice.length;
  const hasMore = next < all.length;

  return {
    items: slice,
    nextCursor: hasMore ? String(next) : null,
    hasMore,
  };
}

/** In-memory full-list cache per source id (aligned with explore feed TTL). */
const listCache = new Map<string, { expiresAt: number; items: ExploreFeedItem[] }>();

function listCacheTtlMs(): number {
  const raw = process.env.ELSER_FEED_CACHE_TTL_MS;
  const n = raw ? Number(raw) : NaN;
  if (Number.isFinite(n) && n >= 0) return n;
  return 6 * 60 * 60 * 1000; // 6h — aligned with explore service hard TTL
}

async function loadAllItems(
  def: PromptSourceDef,
  forceRefresh = false,
): Promise<ExploreFeedItem[]> {
  if (!forceRefresh) {
    const hit = listCache.get(def.id);
    if (hit && Date.now() < hit.expiresAt) return hit.items;
  }

  let items: ExploreFeedItem[];
  switch (def.kind) {
    case "yukkcat":
      items = await loadYukkcat(def);
      break;
    case "xianyu-json":
      items = await loadXianyu(def);
      break;
    case "davidwu-json":
      items = await loadDavidWu(def);
      break;
    case "tigerowo-cases":
      items = await loadTigerowo(def);
      break;
    case "xianyu-gallery":
      items = await loadXianyuGallery(def);
      break;
    case "youmind-readme":
    case "youmind-seedance":
      items = await loadYoumindReadme(def);
      break;
    case "ericgood-video":
      items = await loadEricgoodVideo(def);
      break;
    default:
      items = [];
  }

  listCache.set(def.id, {
    expiresAt: Date.now() + listCacheTtlMs(),
    items,
  });
  return items;
}

async function loadYukkcat(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<unknown>(def.url);
  if (!Array.isArray(data)) return [];
  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();
  data.forEach((raw, index) => {
    const row = (raw ?? {}) as YukkcatRaw;
    const title = String(row.title ?? "").trim();
    const prompt = String(row.prompt ?? "").trim();
    if (!title || !prompt) return;
    const refs = (row.referenceImageUrls ?? [])
      .map((u) => absoluteUrl(def.url, String(u || "").trim()))
      .filter(Boolean);
    const cover =
      absoluteUrl(def.url, String(row.coverUrl ?? "").trim()) || refs[0] || "";
    if (!cover) return;
    const id = String(row.id ?? "").trim() || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(
      toItem({
        id,
        title,
        prompt,
        mediaUrl: cover,
        refs,
        author: String(row.author ?? "").trim() || def.label,
        tags: Array.isArray(row.tags)
          ? row.tags.map((t) => String(t).trim()).filter(Boolean)
          : [def.id],
        modelId: String(row.imageModel ?? "").trim() || null,
        createdAt: String(row.createdAt ?? "").trim() || null,
      }),
    );
  });
  return out;
}

async function loadXianyu(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<{
    dates?: Array<{ items?: XianyuItem[] }>;
    items?: XianyuItem[];
  }>(def.url);

  const flat: XianyuItem[] = [];
  if (Array.isArray(data.dates)) {
    for (const d of data.dates) {
      if (Array.isArray(d.items)) flat.push(...d.items);
    }
  }
  if (Array.isArray(data.items)) flat.push(...data.items);

  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();
  flat.forEach((row, index) => {
    const prompt = String(row.prompt ?? "").trim();
    const media =
      String(row.primary_image_url ?? "").trim() ||
      (row.image_urls?.[0] ? String(row.image_urls[0]).trim() : "");
    if (!prompt || !media) return;
    const sourceUrl = String(row.x_url || row.url || "").trim();
    const id = sourceUrl || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const title =
      String(row.reason ?? "").trim() ||
      prompt.slice(0, 48) ||
      def.label;
    const refs = (row.image_urls ?? [])
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    out.push(
      toItem({
        id: `${def.id}:${hashId(id)}`,
        title,
        prompt,
        mediaUrl: media,
        refs: refs.length ? refs : [media],
        author: String(row.author ?? "").trim() || "X",
        tags: [def.id, "x"],
        modelId: "gpt-image-2",
        createdAt: String(row.created_at ?? "").trim() || null,
        likeCount: Number(row.like_count) || 0,
        viewCount: Number(row.view_count) || Number(row.engagement_score) || 0,
      }),
    );
  });
  return out;
}

async function loadDavidWu(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<unknown>(def.url);
  if (!Array.isArray(data)) return [];
  const base = def.url.replace(/\/[^/]+$/, "");
  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  data.forEach((raw, index) => {
    const row = (raw ?? {}) as DavidWuItem;
    const prompt = String(row.prompt ?? "").trim();
    if (!prompt) return;
    const title =
      String(row.title_cn ?? "").trim() ||
      String(row.title_en ?? "").trim() ||
      `Prompt ${index + 1}`;
    const imagePath = String(row.image ?? "").trim();
    const media = imagePath ? absoluteUrl(`${base}/`, imagePath) : "";
    if (!media) return;
    const id = String(row.id ?? "").trim() || String(index + 1);
    const fullId = `${def.id}:${id}`;
    if (seen.has(fullId)) return;
    seen.add(fullId);
    const tags = [
      def.id,
      String(row.category_cn || row.category || "").trim(),
    ].filter(Boolean);
    out.push(
      toItem({
        id: fullId,
        title,
        prompt,
        mediaUrl: media,
        refs: [media],
        author: String(row.author ?? "").trim() || def.label,
        tags,
        modelId: "gpt-image-2",
        createdAt: null,
      }),
    );
  });
  return out;
}

type XianyuGalleryItem = {
  id?: string;
  title?: string;
  model?: string;
  category?: string;
  source?: string;
  sourceUrl?: string;
  image?: string;
  prompt?: string;
  tags?: string[];
};

async function loadXianyuGallery(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<{ prompts?: XianyuGalleryItem[] }>(def.url);
  const rows = Array.isArray(data.prompts) ? data.prompts : [];
  const assetBase = def.url.replace(/\/data\/[^/]+$/, "/");
  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const prompt = String(row.prompt ?? "").trim();
    const imagePath = String(row.image ?? "").trim();
    if (!prompt || !imagePath) return;
    const media = absoluteUrl(assetBase, imagePath);
    if (!media) return;
    const id = String(row.id ?? "").trim() || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const model = String(row.model ?? "").trim();
    const title =
      String(row.title ?? "").trim() ||
      prompt.slice(0, 48) ||
      def.label;
    out.push(
      toItem({
        id: `${def.id}:${id}`,
        title,
        prompt,
        mediaUrl: media,
        refs: [media],
        author: String(row.source ?? "").trim() || def.label,
        tags: [
          def.id,
          model,
          String(row.category ?? "").trim(),
          ...(Array.isArray(row.tags)
            ? row.tags.map((t) => String(t).trim()).filter(Boolean)
            : []),
        ].filter(Boolean),
        modelId: model || null,
        createdAt: null,
      }),
    );
  });
  return out;
}

type YoumindVideoMap = Record<string, string>;

/** YouMind README galleries (Seedance / Seedream / Grok / Gemini, …). */
async function loadYoumindReadme(
  def: PromptSourceDef,
): Promise<ExploreFeedItem[]> {
  const videoUrlsUrl = def.url.replace(/\/[^/]+$/, "/video-urls.json");
  const [markdown, videoJson] = await Promise.all([
    getText(def.url, 60_000),
    getJson<{ prompts?: YoumindVideoMap } | YoumindVideoMap>(videoUrlsUrl).catch(
      () => ({}) as YoumindVideoMap,
    ),
  ]);

  const videoMap: YoumindVideoMap =
    videoJson &&
    typeof videoJson === "object" &&
    "prompts" in videoJson &&
    videoJson.prompts &&
    typeof videoJson.prompts === "object"
      ? videoJson.prompts
      : ((videoJson as YoumindVideoMap) ?? {});

  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();
  const blockRe = /^### (.+)\n([\s\S]*?)(?=^### |\n## )/gm;
  let match: RegExpExecArray | null;
  const modelId = def.modelId?.trim() || null;
  const tag = def.tag?.trim() || "";

  while ((match = blockRe.exec(markdown)) !== null) {
    const rawTitle = match[1].trim();
    const body = match[2] ?? "";
    const promptMatch = body.match(/```(?:[\w-]*)?\n([\s\S]*?)```/);
    const prompt = (promptMatch?.[1] ?? "").trim();
    if (!prompt) continue;

    const idMatch = body.match(/[?&]id=(\d+)/);
    const id = idMatch?.[1]?.trim() || hashId(`${rawTitle}\n${prompt.slice(0, 80)}`);
    if (seen.has(id)) continue;
    seen.add(id);

    const imgMatch = body.match(/<img[^>]+src=["']([^"']+)["']/i);
    const thumb = (imgMatch?.[1] ?? "").trim();
    const hrefMatch = body.match(/<a[^>]+href=["']([^"']+\.mp4[^"']*)["']/i);
    const hrefVideo = (hrefMatch?.[1] ?? "").trim();
    const mappedVideo = String(videoMap[id] ?? "").trim();
    const rawVideo = mappedVideo || hrefVideo;
    const video = isBrowserPlayableVideoUrl(rawVideo) ? rawVideo : "";
    const mediaUrl = video || thumb;
    if (!mediaUrl) continue;

    const title =
      rawTitle.replace(/^No\.\s*\d+:\s*/i, "").trim() || def.label;
    const authorMatch =
      body.match(/\*\*(?:Author|作者)\*\*[：:]\s*(?:\[([^\]]+)\]\([^)]+\)|([^\n*|]+))/i) ||
      body.match(/\*\*(?:Author|作者)\*\*[：:]\s*\[([^\]]+)\]/i);
    const author =
      (authorMatch?.[1] || authorMatch?.[2] || "").trim() || def.label;

    const publishedMatch = body.match(
      /\*\*(?:Published|发布|发布时间)\*\*[：:]\s*([^\n*|]+)/i,
    );
    const publishedRaw = (publishedMatch?.[1] ?? "").trim();
    const createdAt = publishedRaw ? parseLooseDate(publishedRaw) : null;

    out.push(
      toItem({
        id: `${def.id}:${id}`,
        type: video ? "video" : "image",
        title,
        prompt,
        mediaUrl,
        thumbnailUrl: thumb || mediaUrl,
        refs: thumb ? [thumb] : [],
        author,
        tags: [def.id, tag, "youmind"].filter(Boolean),
        modelId,
        createdAt,
      }),
    );
  }

  return out;
}

function parseLooseDate(input: string): string | null {
  const t = Date.parse(input.trim());
  if (Number.isFinite(t)) return new Date(t).toISOString();
  return null;
}

type DomerTask = {
  id?: string;
  mediaType?: string;
  model?: string;
  prompt?: string;
  options?: string;
  taskInfo?: string;
  likeCount?: number;
  createdAt?: string;
  user?: { name?: string | null; image?: string | null };
};

type DomerFeed = {
  data?: {
    tasks?: DomerTask[];
    hasMore?: boolean;
  };
};

/** Live community feed (Domer). Cursor is a 1-based page number. */
async function loadDomerPage(
  def: PromptSourceDef,
  limit: number,
  cursor?: string,
): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  let page = Math.max(1, parseOffset(cursor) || 1);
  const pageSize = Math.max(1, Math.min(limit, 24));
  const filter = def.modelFilter?.trim().toLowerCase() || "";
  // When filtering by model, scan ahead so sparse chips still fill a page.
  const softCap = filter ? 12 : 1;
  const hardCap = filter ? 24 : 1;
  const items: ExploreFeedItem[] = [];
  const seen = new Set<string>();
  let upstreamHasMore = false;
  let pagesScanned = 0;

  while (items.length < pageSize && pagesScanned < hardCap) {
    if (pagesScanned >= softCap && items.length > 0) break;
    const url = new URL(def.url);
    url.searchParams.set("limit", String(pageSize));
    url.searchParams.set("page", String(page));

    const data = await getJson<DomerFeed>(url.toString());
    const tasks = Array.isArray(data.data?.tasks) ? data.data.tasks : [];
    upstreamHasMore = Boolean(data.data?.hasMore);
    pagesScanned += 1;

    for (const task of tasks) {
      if (items.length >= pageSize) break;
      const model = String(task.model ?? "").trim();
      if (filter && !model.toLowerCase().includes(filter)) continue;
      const prompt = String(task.prompt ?? "").trim();
      const media = extractDomerMedia(task.taskInfo);
      if (!prompt || !media) continue;
      const id = String(task.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const type = task.mediaType === "video" ? "video" : "image";
      const title = prompt.slice(0, 48) || def.label;
      items.push(
        toItem({
          id: `${def.id}:${id}`,
          type,
          title,
          prompt,
          mediaUrl: media,
          thumbnailUrl: media,
          refs: [],
          author: String(task.user?.name ?? "").trim() || def.label,
          avatarUrl: String(task.user?.image ?? "").trim() || null,
          tags: [def.id, model].filter(Boolean),
          modelId: model || null,
          createdAt: task.createdAt ?? null,
          likeCount: Number(task.likeCount) || 0,
          aspectRatio: extractDomerAspect(task.options),
        }),
      );
    }

    page += 1;
    if (!upstreamHasMore) break;
  }

  const hasMore = upstreamHasMore;
  return {
    items,
    nextCursor: hasMore ? String(page) : null,
    hasMore,
  };
}

function extractDomerMedia(taskInfo?: string): string {
  if (!taskInfo) return "";
  try {
    const info = JSON.parse(taskInfo) as {
      videos?: Array<{ videoUrl?: string }>;
      images?: Array<{ imageUrl?: string }>;
    };
    return (
      String(info.videos?.[0]?.videoUrl ?? "").trim() ||
      String(info.images?.[0]?.imageUrl ?? "").trim()
    );
  } catch {
    return "";
  }
}

function extractDomerAspect(options?: string): string | null {
  if (!options) return null;
  try {
    const parsed = JSON.parse(options) as { aspect_ratio?: string };
    const ratio = String(parsed.aspect_ratio ?? "").trim();
    return ratio || null;
  } catch {
    return null;
  }
}

type CivitaiImage = {
  url?: string;
  nsfwLevel?: number;
  width?: number;
  height?: number;
  hasPositivePrompt?: boolean;
  meta?: { prompt?: string } | null;
};

type CivitaiVersion = {
  id?: number;
  name?: string;
  trainedWords?: string[];
  baseModel?: string;
  images?: CivitaiImage[];
};

type CivitaiModel = {
  id?: number;
  name?: string;
  type?: string;
  description?: string;
  nsfw?: boolean;
  tags?: string[];
  creator?: { username?: string; image?: string | null };
  stats?: { downloadCount?: number; thumbsUpCount?: number };
  modelVersions?: CivitaiVersion[];
};

type CivitaiModelsRes = {
  items?: CivitaiModel[];
  metadata?: { nextCursor?: string | null; nextPage?: string | null };
};

/** Civitai model market → explore cards (cover + trigger/description prompt). */
async function loadCivitaiModelsPage(
  def: PromptSourceDef,
  limit: number,
  cursor?: string,
): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const pageSize = Math.max(1, Math.min(limit, 20));
  const url = new URL(def.url || "https://civitai.com/api/v1/models");
  url.searchParams.set("limit", String(pageSize));
  url.searchParams.set("nsfw", "false");
  url.searchParams.set("sort", def.civitaiSort || "Highest Rated");
  if (def.civitaiTypes?.trim()) {
    url.searchParams.set("types", def.civitaiTypes.trim());
  }
  if (cursor?.trim()) url.searchParams.set("cursor", cursor.trim());

  const data = await getJson<CivitaiModelsRes>(url.toString());
  const rows = Array.isArray(data.items) ? data.items : [];

  // List payload already includes version images + trainedWords — skip N+1
  // model-version detail fetches (was the main first-load bottleneck via proxy).
  const items: ExploreFeedItem[] = [];
  for (const model of rows) {
    if (model.nsfw) continue;
    const id = String(model.id ?? "").trim();
    const ver = model.modelVersions?.[0];
    if (!id || !ver) continue;

    const cover = pickCivitaiCover(ver.images ?? []);
    const mediaUrl = String(cover?.url ?? "").trim();
    if (!mediaUrl) continue;

    const triggers = (ver.trainedWords ?? [])
      .map((w) => String(w || "").trim())
      .filter(Boolean);
    const fromMeta = String(cover?.meta?.prompt ?? "").trim();
    const fromDesc = stripHtml(String(model.description ?? "")).slice(0, 480);
    const title = String(model.name ?? "").trim() || def.label;
    const prompt =
      fromMeta ||
      triggers.join(", ") ||
      fromDesc ||
      `masterpiece, best quality, ${title}`;

    const w = Number(cover?.width) || 0;
    const h = Number(cover?.height) || 0;
    items.push(
      toItem({
        id: `${def.id}:${id}`,
        title,
        prompt,
        mediaUrl,
        thumbnailUrl: mediaUrl,
        refs: [mediaUrl],
        author: String(model.creator?.username ?? "").trim() || "Civitai",
        avatarUrl: String(model.creator?.image ?? "").trim() || null,
        tags: [
          def.id,
          String(model.type ?? "").trim(),
          String(ver.baseModel ?? "").trim(),
          ...(model.tags ?? []).slice(0, 4).map((t) => String(t)),
        ].filter(Boolean),
        modelId: String(ver.baseModel || model.type || "civitai").trim(),
        createdAt: null,
        likeCount: Number(model.stats?.thumbsUpCount) || 0,
        viewCount: Number(model.stats?.downloadCount) || 0,
        aspectRatio: w > 0 && h > 0 ? `${w}:${h}` : null,
      }),
    );
  }

  const nextCursor = String(data.metadata?.nextCursor ?? "").trim() || null;
  return {
    items,
    nextCursor,
    hasMore: Boolean(nextCursor) && items.length > 0,
  };
}

function pickCivitaiCover(images: CivitaiImage[]): CivitaiImage | null {
  const scored = images
    .filter((img) => img.url)
    .map((img) => {
      const w = Number(img.width) || 0;
      const h = Number(img.height) || 0;
      const ar = w > 0 && h > 0 ? w / h : 1;
      // Prefer portrait / near-square sample art over ultra-wide banners.
      const ratioScore = ar > 1.6 ? -3 : ar < 0.55 ? -1 : ar <= 1.15 ? 2 : 1;
      const nsfwScore = Number(img.nsfwLevel ?? 0) <= 1 ? 2 : 0;
      const promptScore =
        img.hasPositivePrompt || img.meta?.prompt ? 1 : 0;
      return { img, score: ratioScore + nsfwScore + promptScore };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.img ?? null;
}

type PixaiImageUrl = { variant?: string; url?: string };

type PixaiGqlEdge = {
  node?: {
    id?: string;
    title?: string;
    type?: string;
    media?: {
      id?: string;
      urls?: PixaiImageUrl[];
    };
  };
};

function pickPixaiMediaUrls(urls: PixaiImageUrl[] | undefined): {
  mediaUrl: string;
  thumbnailUrl: string;
} {
  const list = Array.isArray(urls) ? urls : [];
  const byVariant = (variant: string) =>
    String(
      list.find((u) => String(u.variant ?? "").toUpperCase() === variant)
        ?.url ?? "",
    ).trim();
  const publicUrl = byVariant("PUBLIC");
  const thumb =
    byVariant("THUMBNAIL") ||
    byVariant("STILL_THUMBNAIL") ||
    publicUrl;
  const mediaUrl = publicUrl || thumb || String(list[0]?.url ?? "").trim();
  return { mediaUrl, thumbnailUrl: thumb || mediaUrl };
}

/** PixAI market via api.pixai.art GraphQL (HTML scrape is TLS-unreliable via proxy). */
async function loadPixaiMarketPage(
  def: PromptSourceDef,
  limit: number,
  cursor?: string,
): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const pageSize = Math.max(1, Math.min(limit, 24));
  return loadPixaiViaGraphql(def, pageSize, cursor);
}

async function loadPixaiViaGraphql(
  def: PromptSourceDef,
  pageSize: number,
  cursor?: string,
): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  // Public schema: generationModels(first, after). Sort args are not exposed;
  // hot / newest sources share the default market ordering for now.
  void def.pixaiSort;

  const query = `
    query generationModels($first: Int, $after: String) {
      generationModels(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            type
            media { id urls { variant url } }
          }
        }
      }
    }
  `;

  const payload = await postJson<{
    data?: {
      generationModels?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        edges?: PixaiGqlEdge[];
      };
    };
    errors?: Array<{ message?: string }>;
  }>(
    `${def.url}?operation=generationModels`,
    {
      operationName: "generationModels",
      query,
      variables: {
        first: pageSize,
        after: cursor?.trim() || null,
      },
    },
    {
      Origin: "https://pixai.art",
      Referer: "https://pixai.art/zh/market",
    },
    5,
  );

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "pixai graphql error");
  }

  const conn = payload.data?.generationModels;
  const edges = Array.isArray(conn?.edges) ? conn!.edges! : [];
  const items: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;
    const id = String(node.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const { mediaUrl, thumbnailUrl } = pickPixaiMediaUrls(node.media?.urls);
    if (!mediaUrl) continue;
    const title = String(node.title ?? "").trim() || def.label;
    items.push(
      toItem({
        id: `${def.id}:${id}`,
        title,
        prompt: `masterpiece, best quality, anime style, ${title}`,
        mediaUrl,
        thumbnailUrl,
        refs: [mediaUrl],
        author: "PixAI",
        tags: [def.id, String(node.type ?? "").trim(), "pixai"].filter(Boolean),
        modelId: String(node.type || "pixai").trim(),
        createdAt: null,
      }),
    );
  }

  const nextCursor = String(conn?.pageInfo?.endCursor ?? "").trim() || null;
  const hasMore = Boolean(conn?.pageInfo?.hasNextPage) && Boolean(nextCursor);
  return { items, nextCursor: hasMore ? nextCursor : null, hasMore };
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

type EricgoodItem = {
  id?: string;
  title?: string;
  title_zh?: string;
  prompt?: string;
  author?: string;
  video?: string;
  thumbnail?: string;
  category?: string;
  tag?: string;
  model?: string;
};

async function loadEricgoodVideo(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<unknown>(def.url);
  if (!Array.isArray(data)) return [];
  const assetBase = def.url.replace(/\/[^/]+$/, "/");
  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  data.forEach((raw, index) => {
    const row = (raw ?? {}) as EricgoodItem;
    const prompt = String(row.prompt ?? "").trim();
    if (!prompt) return;
    const videoPath = String(row.video ?? "").trim();
    const thumbPath = String(row.thumbnail ?? "").trim();
    const video = videoPath ? absoluteUrl(assetBase, videoPath) : "";
    const thumb = thumbPath ? absoluteUrl(assetBase, thumbPath) : "";
    const mediaUrl = video || thumb;
    if (!mediaUrl) return;
    const id = String(row.id ?? "").trim() || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const title =
      String(row.title_zh ?? "").trim() ||
      String(row.title ?? "").trim() ||
      def.label;
    out.push(
      toItem({
        id: `${def.id}:${id}`,
        type: video ? "video" : "image",
        title,
        prompt,
        mediaUrl,
        thumbnailUrl: thumb || mediaUrl,
        refs: thumb ? [thumb] : [],
        author: String(row.author ?? "").trim() || def.label,
        tags: [
          def.id,
          String(row.category || row.tag || "").trim(),
        ].filter(Boolean),
        modelId: String(row.model ?? "Seedance 2.0").trim() || "seedance-2.0",
        createdAt: null,
      }),
    );
  });
  return out;
}

async function loadTigerowo(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const base = def.url.replace(/\/$/, "");
  const jsonRaw = await getText(`${base}/data/ingested_tweets.json`, 20_000);
  const mdBodies = await mapPool(TIGER_CASE_FILES, 2, (file) =>
    getText(`${base}/${file}`, 20_000).catch(() => ""),
  );

  let records: TigerRecord[] = [];
  try {
    const parsed = JSON.parse(jsonRaw) as { records?: TigerRecord[] };
    records = Array.isArray(parsed.records) ? parsed.records : [];
  } catch {
    records = [];
  }

  const cases = new Map<string, TigerCase>();
  for (const md of mdBodies) {
    if (md) collectTigerCases(cases, md, base);
  }

  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();
  records.forEach((rec, index) => {
    const tweet = String(rec.tweet_url ?? "").trim();
    const dir = String(rec.image_dir ?? "").trim();
    let c = (tweet && cases.get(tweet)) || (dir && cases.get(dir)) || null;
    if (!c?.prompt) return;

    let media = c.image;
    if (!media && dir) {
      media = `${base}/${dir.replace(/^\.\.\//, "")}/output.jpg`;
    }
    if (!media) return;

    const id = tweet || dir || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);

    const title = String(rec.title ?? "").trim() || `Case ${index + 1}`;
    const tags = [
      def.id,
      ...tagsFromCategory(String(rec.category ?? "")),
    ].filter(Boolean);

    out.push(
      toItem({
        id: `${def.id}:${hashId(id)}`,
        title,
        prompt: c.prompt,
        mediaUrl: media,
        refs: [media],
        author: String(rec.author_handle ?? "").trim() || def.label,
        tags,
        modelId: "gpt-image-2",
        createdAt: String(rec.added_at ?? "").trim() || null,
      }),
    );
  });

  // Fallback: cases found in MD but missing from JSON index
  if (out.length === 0) {
    let i = 0;
    for (const [key, c] of cases) {
      if (!c.prompt || !c.image) continue;
      i += 1;
      out.push(
        toItem({
          id: `${def.id}:${hashId(key)}`,
          title: `Case ${i}`,
          prompt: c.prompt,
          mediaUrl: c.image,
          refs: [c.image],
          author: def.label,
          tags: [def.id],
          modelId: "gpt-image-2",
          createdAt: null,
        }),
      );
    }
  }

  return out;
}

function collectTigerCases(
  cases: Map<string, TigerCase>,
  markdown: string,
  base: string,
) {
  const blockRe =
    /###\s+Case\s+\d+:\s+\[([^\]]+)\]\(([^)]+)\)[\s\S]*?(?:\*\*(?:Prompt|提示词):\*\*)\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/gi;
  const imageDirRe = /images\/[\w-]+_case\d+/i;
  const imageRe = /<img[^>]+src="([^"]+)"|!\[[^\]]*\]\(([^)]+)\)/i;

  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(markdown)) !== null) {
    const tweetUrl = match[2].trim();
    const prompt = match[3].trim();
    if (!prompt) continue;
    let image = "";
    const imgMatch = imageRe.exec(match[0]);
    if (imgMatch) {
      const path = (imgMatch[1] || imgMatch[2] || "").trim();
      image = absoluteUrl(`${base}/`, path.replace(/^\.\.\//, ""));
    }
    const dir = imageDirRe.exec(match[0])?.[0] ?? "";
    if (!image && dir) {
      image = `${base}/${dir}/output.jpg`;
    }
    const item: TigerCase = { prompt, image };
    if (tweetUrl) cases.set(tweetUrl, item);
    if (dir) cases.set(dir, item);
  }
}

function toItem(input: {
  id: string;
  title: string;
  prompt: string;
  mediaUrl: string;
  refs: string[];
  author: string;
  avatarUrl?: string | null;
  tags: string[];
  modelId: string | null;
  createdAt: string | null;
  likeCount?: number;
  viewCount?: number;
  type?: string;
  thumbnailUrl?: string;
  aspectRatio?: string | null;
}): ExploreFeedItem {
  return {
    id: input.id,
    type: input.type || "image",
    title: input.title,
    prompt: input.prompt,
    mediaUrl: input.mediaUrl,
    thumbnailUrl: input.thumbnailUrl || input.mediaUrl,
    referenceUrls: input.refs,
    modelId: input.modelId,
    likeCount: input.likeCount ?? 0,
    favoriteCount: 0,
    viewCount: input.viewCount ?? 0,
    recreateCount: 0,
    author: {
        nickname: input.author,
        avatarUrl: input.avatarUrl ?? null,
    },
    aspectRatio: input.aspectRatio ?? null,
    width: null,
    height: null,
    tags: input.tags,
    createdAt: input.createdAt,
  };
}

async function getJson<T>(url: string): Promise<T> {
  return withRetry(async () => {
    try {
      const proxyCfg = await marketProxyAxiosConfig(url);
      const { data, status } = await axios.get<T>(url, {
        timeout: FETCH_TIMEOUT_MS,
        headers: { Accept: "application/json", "User-Agent": UA },
        validateStatus: () => true,
        responseType: "json",
        ...proxyCfg,
      });
      if (status >= 400 || data == null) {
        throw new Error(`prompt source fetch failed ${status}: ${url}`);
      }
      return data;
    } catch (err) {
      if (isMarketProxyHost(url)) {
        invalidateMarketProxy(
          err instanceof Error ? err.message : "getJson failed",
        );
      }
      throw err;
    }
  });
}

async function postJson<T>(
  url: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
  attempts = 3,
): Promise<T> {
  return withRetry(async () => {
    try {
      const proxyCfg = await marketProxyAxiosConfig(url);
      const { data, status } = await axios.post<T>(url, body, {
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": UA,
          ...(extraHeaders || {}),
        },
        validateStatus: () => true,
        responseType: "json",
        ...proxyCfg,
      });
      if (status >= 400 || data == null) {
        throw new Error(`prompt source post failed ${status}: ${url}`);
      }
      return data;
    } catch (err) {
      if (isMarketProxyHost(url)) {
        invalidateMarketProxy(
          err instanceof Error ? err.message : "postJson failed",
        );
      }
      throw err;
    }
  }, attempts);
}

async function getText(url: string, timeout = FETCH_TIMEOUT_MS): Promise<string> {
  return withRetry(async () => {
    try {
      const proxyCfg = await marketProxyAxiosConfig(url);
      const { data, status } = await axios.get<string>(url, {
        timeout,
        headers: { Accept: "text/plain,*/*", "User-Agent": UA },
        validateStatus: () => true,
        responseType: "text",
        transformResponse: [(d) => d],
        ...proxyCfg,
      });
      if (status >= 400 || typeof data !== "string") {
        throw new Error(`prompt source fetch failed ${status}: ${url}`);
      }
      return data;
    } catch (err) {
      if (isMarketProxyHost(url)) {
        invalidateMarketProxy(
          err instanceof Error ? err.message : "getText failed",
        );
      }
      throw err;
    }
  });
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        out[index] = await fn(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw last;
}

function parseOffset(cursor?: string): number {
  if (!cursor?.trim()) return 0;
  const n = Number(cursor.trim());
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function absoluteUrl(baseUrl: string, path: string): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

/** 上游偶发把预览视频挂在 GitHub user-attachments，浏览器无法稳定播放 */
function isBrowserPlayableVideoUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (/github\.com\/user-attachments\//i.test(u)) return false;
  if (/private-user-images\.githubusercontent\.com/i.test(u)) return false;
  return true;
}

function pad(n: number) {
  return String(n).padStart(4, "0");
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function tagsFromCategory(category: string): string[] {
  const cleaned = category
    .replace(/Cases?/gi, "")
    .replace(/&/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[\s/|]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);
}
