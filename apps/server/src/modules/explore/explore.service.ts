import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

type ElserFeedItem = {
  id?: string;
  community_post_id?: string;
  type?: string;
  media_url?: string;
  thumbnail_url?: string;
  title?: string | null;
  model_id?: string | null;
  prompt?: string | null;
  like_count?: number;
  favorite_count?: number;
  view_count?: number;
  recreate_count?: number;
  user_nickname?: string | null;
  user_avatar_url?: string | null;
  aspect_ratio?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  created_at?: string | null;
  generation_params?: {
    community_tags?: string[];
    image_inputs?: unknown;
    video_inputs?: unknown;
    audio_inputs?: unknown;
    parameters?: Record<string, unknown> | null;
  } | null;
};

type ElserFeedResponse = {
  items?: ElserFeedItem[];
  next_cursor?: string | null;
  has_more?: boolean;
};

export type ExploreFeedItem = {
  id: string;
  type: "image" | "video" | string;
  title: string;
  prompt: string;
  mediaUrl: string;
  thumbnailUrl: string;
  /** Reference media used for the original generation (from generation_params). */
  referenceUrls: string[];
  modelId: string | null;
  likeCount: number;
  favoriteCount: number;
  viewCount: number;
  recreateCount: number;
  author: {
    nickname: string;
    avatarUrl: string | null;
  };
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  tags: string[];
  createdAt: string | null;
};

export type ExploreFeedResult = {
  items: ExploreFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: ExploreFeedResult;
};

/** 默认 10 分钟，降低对 Elser 上游的请求频率 */
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: ConfigService) {}

  async feed(params: {
    limit?: number;
    cursor?: string;
    /** 精选：对应 Elser featured_only=true */
    featuredOnly?: boolean;
    /** 分类标签：对应 Elser tag=fanart|fantasy|… */
    tag?: string;
    /** 热门模型：对应 Elser model_id */
    modelId?: string;
  }): Promise<ExploreFeedResult> {
    const base =
      this.config.get<string>("ELSER_FEED_BASE_URL") ??
      "https://api.tool.elser.ai/v1";
    const limit = Math.max(1, Math.min(Number(params.limit) || 24, 48));
    const url = new URL(`${base.replace(/\/$/, "")}/community/feed`);
    url.searchParams.set("limit", String(limit));
    if (params.cursor?.trim()) {
      url.searchParams.set("cursor", params.cursor.trim());
    }
    if (params.featuredOnly) {
      url.searchParams.set("featured_only", "true");
    }
    if (params.tag?.trim()) {
      url.searchParams.set("tag", params.tag.trim());
    }
    if (params.modelId?.trim()) {
      url.searchParams.set("model_id", params.modelId.trim());
    }

    const cacheKey = url.search;
    const cached = this.getCache(cacheKey);
    if (cached) return cached;

    try {
      const { data, status } = await axios.get<ElserFeedResponse>(url.toString(), {
        timeout: 30_000,
        headers: {
          Accept: "application/json",
          "User-Agent": "JoyAI/0.1 (+explore-proxy)",
        },
        validateStatus: () => true,
      });

      if (status >= 400 || !data) {
        this.logger.warn(`Elser feed upstream ${status} ${url.search}`);
        throw new ServiceUnavailableException("探索内容暂时不可用，请稍后重试");
      }

      const items = (data.items ?? [])
        .map((item) => this.mapItem(item))
        .filter((item): item is ExploreFeedItem => Boolean(item));

      const result: ExploreFeedResult = {
        items,
        nextCursor: data.next_cursor ?? null,
        hasMore: Boolean(data.has_more),
      };
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Elser feed proxy failed: ${error instanceof Error ? error.message : error}`,
      );
      throw new ServiceUnavailableException("探索内容暂时不可用，请稍后重试");
    }
  }

  private cacheTtlMs(): number {
    const raw = this.config.get<string>("ELSER_FEED_CACHE_TTL_MS");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
    return DEFAULT_CACHE_TTL_MS;
  }

  private getCache(key: string): ExploreFeedResult | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return hit.value;
  }

  private setCache(key: string, value: ExploreFeedResult) {
    const ttl = this.cacheTtlMs();
    if (ttl <= 0) return;

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, {
      expiresAt: Date.now() + ttl,
      value,
    });
  }

  private mapItem(item: ElserFeedItem): ExploreFeedItem | null {
    const id = item.id || item.community_post_id;
    const mediaUrl = item.media_url || item.thumbnail_url;
    if (!id || !mediaUrl) return null;

    return {
      id,
      type: item.type || "image",
      title: (item.title || item.prompt || "未命名作品").trim(),
      prompt: (item.prompt || item.title || "").trim(),
      mediaUrl,
      thumbnailUrl: item.thumbnail_url || mediaUrl,
      referenceUrls: extractReferenceUrls(item.generation_params),
      modelId: item.model_id ?? null,
      likeCount: item.like_count ?? 0,
      favoriteCount: item.favorite_count ?? 0,
      viewCount: item.view_count ?? 0,
      recreateCount: item.recreate_count ?? 0,
      author: {
        nickname: item.user_nickname?.trim() || "创作者",
        avatarUrl: item.user_avatar_url ?? null,
      },
      aspectRatio: item.aspect_ratio ?? null,
      width: item.media_width ?? null,
      height: item.media_height ?? null,
      tags: item.generation_params?.community_tags ?? [],
      createdAt: item.created_at ?? null,
    };
  }
}

function extractReferenceUrls(
  params: ElserFeedItem["generation_params"],
): string[] {
  if (!params) return [];
  const nested = params.parameters ?? null;
  const bags: unknown[] = [
    params.image_inputs,
    params.video_inputs,
    params.audio_inputs,
    nested?.image_inputs,
    nested?.video_inputs,
    nested?.audio_inputs,
    nested?.reference_images,
    nested?.reference_videos,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const raw of bag) {
      const url =
        typeof raw === "string"
          ? raw.trim()
          : raw &&
              typeof raw === "object" &&
              typeof (raw as { url?: unknown }).url === "string"
            ? String((raw as { url: string }).url).trim()
            : "";
      if (!url || seen.has(url)) continue;
      if (!/^https?:\/\//i.test(url) && !url.startsWith("data:")) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}
