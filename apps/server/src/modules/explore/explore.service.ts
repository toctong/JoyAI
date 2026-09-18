import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import {
  fetchPromptSourceFeed,
  listPromptSources,
} from "./prompt-source-feed";
import { findPromptSource } from "./prompt-sources";
import {
  configureMarketProxyResolver,
  EXPLORE_MARKET_PROXY_SETTING_KEY,
} from "./explore-market-proxy";
import { SettingsService } from "../settings/settings.service";
import type { ExploreFeedItem, ExploreFeedResult } from "./explore.types";

export type { ExploreFeedItem, ExploreFeedResult } from "./explore.types";

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

type CacheEntry = {
  /** Soft freshness — past this, serve stale + background revalidate (SWR). */
  softUntil: number;
  /** Hard expiry — past this, treat as miss (unless warmer/SWR still writing). */
  expiresAt: number;
  value: ExploreFeedResult;
  refreshing?: boolean;
};

export type ExploreFeedOptions = {
  /** Bypass cache read and refresh upstream (used by warmer). */
  forceRefresh?: boolean;
};

/**
 * Default hard TTL 6h. With background warmer (~3h) users hit warm cache;
 * long TTL is a safety net so a missed warm cycle still serves instantly.
 */
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Soft window before SWR background refresh (independent of hard TTL). */
const DEFAULT_SOFT_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 400;

@Injectable()
export class ExploreService implements OnModuleInit {
  private readonly logger = new Logger(ExploreService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    configureMarketProxyResolver(async () => {
      const row = await this.settings.get(EXPLORE_MARKET_PROXY_SETTING_KEY);
      const raw = row?.value;
      if (typeof raw === "string") return raw.trim() || null;
      if (raw == null) return null;
      return String(raw).trim() || null;
    });
  }

  sources() {
    return {
      items: [
        {
          id: "elser",
          label: "Elser",
          homepage: "https://elser.ai",
          media: "mixed" as const,
        },
        ...listPromptSources(),
      ],
    };
  }

  async feed(
    params: {
      limit?: number;
      cursor?: string;
      /** 精选：对应 Elser featured_only=true */
      featuredOnly?: boolean;
      /** 分类标签：对应 Elser tag=fanart|fantasy|… */
      tag?: string;
      /** 热门模型：对应 Elser model_id */
      modelId?: string;
      /** 第三方提示词源（与 Elser 互斥） */
      source?: string;
    },
    options?: ExploreFeedOptions,
  ): Promise<ExploreFeedResult> {
    const limit = Math.max(1, Math.min(Number(params.limit) || 24, 48));
    const sourceId = params.source?.trim() || "";
    const forceRefresh = Boolean(options?.forceRefresh);

    if (sourceId && sourceId !== "elser") {
      if (!findPromptSource(sourceId)) {
        throw new ServiceUnavailableException("未知的探索数据源");
      }
      const cacheKey = `prompt:${sourceId}:l${limit}:c${params.cursor?.trim() || ""}`;
      return this.readThrough(cacheKey, forceRefresh, () =>
        fetchPromptSourceFeed({
          sourceId,
          limit,
          cursor: params.cursor,
          forceRefresh,
        }),
      );
    }

    const base =
      this.config.get<string>("ELSER_FEED_BASE_URL") ??
      "https://api.tool.elser.ai/v1";
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

    const cacheKey = `elser:${url.search}`;
    return this.readThrough(cacheKey, forceRefresh, () =>
      this.fetchElser(url.toString()),
    );
  }

  private async readThrough(
    cacheKey: string,
    forceRefresh: boolean,
    loader: () => Promise<ExploreFeedResult>,
  ): Promise<ExploreFeedResult> {
    if (!forceRefresh) {
      const hit = this.getCacheEntry(cacheKey);
      if (hit) {
        if (Date.now() >= hit.softUntil) {
          this.scheduleRevalidate(cacheKey, loader);
        }
        return hit.value;
      }
    }

    try {
      const result = await loader();
      this.setCache(cacheKey, result);
      return result;
    } catch (error) {
      // Stale-if-error: keep serving last good snapshot when upstream flakes.
      const stale = this.cache.get(cacheKey);
      if (stale?.value) {
        this.logger.warn(
          `Explore feed upstream failed, serving stale cache (${cacheKey}): ${
            error instanceof Error ? error.message : error
          }`,
        );
        return stale.value;
      }
      if (error instanceof ServiceUnavailableException) throw error;
      this.logger.error(
        `Explore feed failed (${cacheKey}): ${
          error instanceof Error ? error.message : error
        }`,
      );
      throw new ServiceUnavailableException("探索内容暂时不可用，请稍后重试");
    }
  }

  private scheduleRevalidate(
    cacheKey: string,
    loader: () => Promise<ExploreFeedResult>,
  ) {
    const hit = this.cache.get(cacheKey);
    if (!hit || hit.refreshing) return;
    hit.refreshing = true;
    void loader()
      .then((result) => this.setCache(cacheKey, result))
      .catch((err) => {
        this.logger.warn(
          `Explore SWR refresh failed (${cacheKey}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      })
      .finally(() => {
        const cur = this.cache.get(cacheKey);
        if (cur) cur.refreshing = false;
      });
  }

  private async fetchElser(url: string): Promise<ExploreFeedResult> {
    const { data, status } = await axios.get<ElserFeedResponse>(url, {
      timeout: 30_000,
      headers: {
        Accept: "application/json",
        "User-Agent": "JoyAI/0.1 (+explore-proxy)",
      },
      validateStatus: () => true,
    });

    if (status >= 400 || !data) {
      this.logger.warn(`Elser feed upstream ${status} ${url}`);
      throw new ServiceUnavailableException("探索内容暂时不可用，请稍后重试");
    }

    const items = (data.items ?? [])
      .map((item) => this.mapItem(item))
      .filter((item): item is ExploreFeedItem => Boolean(item));

    return {
      items,
      nextCursor: data.next_cursor ?? null,
      hasMore: Boolean(data.has_more),
    };
  }

  private cacheTtlMs(): number {
    const raw = this.config.get<string>("ELSER_FEED_CACHE_TTL_MS");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
    return DEFAULT_CACHE_TTL_MS;
  }

  private softTtlMs(): number {
    const raw = this.config.get<string>("ELSER_FEED_SOFT_TTL_MS");
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 0) return n;
    return DEFAULT_SOFT_TTL_MS;
  }

  private getCacheEntry(key: string): CacheEntry | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      // Keep entry for stale-if-error, but treat as miss for sync path.
      return null;
    }
    return hit;
  }

  private setCache(key: string, value: ExploreFeedResult) {
    const ttl = this.cacheTtlMs();
    if (ttl <= 0) return;

    if (this.cache.size >= MAX_CACHE_ENTRIES && !this.cache.has(key)) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    const soft = Math.min(this.softTtlMs(), ttl);
    this.cache.set(key, {
      softUntil: Date.now() + soft,
      expiresAt: Date.now() + ttl,
      value,
      refreshing: false,
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
