import axios from "axios";
import type { ExploreFeedItem } from "./explore.types";
import {
  findPromptSource,
  PROMPT_SOURCES,
  type PromptSourceDef,
} from "./prompt-sources";

const FETCH_TIMEOUT_MS = 45_000;
const UA = "JoyAI/0.1 (+explore-prompt-sources)";

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
}): Promise<{
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
}> {
  const def = findPromptSource(params.sourceId);
  if (!def) {
    throw new Error(`unknown prompt source: ${params.sourceId}`);
  }

  const all = await loadAllItems(def);
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

/** In-memory full-list cache per source id */
const listCache = new Map<string, { expiresAt: number; items: ExploreFeedItem[] }>();
const LIST_CACHE_TTL_MS = 15 * 60 * 1000;

async function loadAllItems(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const hit = listCache.get(def.id);
  if (hit && Date.now() < hit.expiresAt) return hit.items;

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
    case "hiapi-seedance":
      items = await loadHiapiSeedance(def);
      break;
    case "ericgood-video":
      items = await loadEricgoodVideo(def);
      break;
    default:
      items = [];
  }

  listCache.set(def.id, {
    expiresAt: Date.now() + LIST_CACHE_TTL_MS,
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

type HiapiItem = {
  id?: string;
  title_zh?: string;
  title_en?: string;
  author?: string;
  preview_image?: string;
  preview_video?: string;
  prompt?: string;
  category?: string;
  aspect_ratio?: string;
};

async function loadHiapiSeedance(def: PromptSourceDef): Promise<ExploreFeedItem[]> {
  const data = await getJson<{ items?: HiapiItem[] }>(def.url);
  const rows = Array.isArray(data.items) ? data.items : [];
  const assetBase = def.url.replace(/\/data\/[^/]+$/, "/");
  const out: ExploreFeedItem[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const prompt = String(row.prompt ?? "").trim();
    if (!prompt) return;
    const video = String(row.preview_video ?? "").trim();
    const imagePath = String(row.preview_image ?? "").trim();
    const thumb = imagePath ? absoluteUrl(assetBase, imagePath) : "";
    const mediaUrl = video || thumb;
    if (!mediaUrl) return;
    const id = String(row.id ?? "").trim() || `${def.id}-${pad(index + 1)}`;
    if (seen.has(id)) return;
    seen.add(id);
    const title =
      String(row.title_zh ?? "").trim() ||
      String(row.title_en ?? "").trim() ||
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
        tags: [def.id, "seedance", String(row.category ?? "").trim()].filter(
          Boolean,
        ),
        modelId: "seedance-2.0",
        createdAt: null,
        aspectRatio: String(row.aspect_ratio ?? "").trim() || null,
      }),
    );
  });
  return out;
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
      avatarUrl: null,
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
    const { data, status } = await axios.get<T>(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: { Accept: "application/json", "User-Agent": UA },
      validateStatus: () => true,
      responseType: "json",
    });
    if (status >= 400 || data == null) {
      throw new Error(`prompt source fetch failed ${status}: ${url}`);
    }
    return data;
  });
}

async function getText(url: string, timeout = FETCH_TIMEOUT_MS): Promise<string> {
  return withRetry(async () => {
    const { data, status } = await axios.get<string>(url, {
      timeout,
      headers: { Accept: "text/plain,*/*", "User-Agent": UA },
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(d) => d],
    });
    if (status >= 400 || typeof data !== "string") {
      throw new Error(`prompt source fetch failed ${status}: ${url}`);
    }
    return data;
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

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (i === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (i + 1)));
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
