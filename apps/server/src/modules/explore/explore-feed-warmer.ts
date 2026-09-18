import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExploreService } from "./explore.service";
import { PROMPT_SOURCES } from "./prompt-sources";

/** Match explore-home first-page request size (cache key includes limit). */
const WARM_LIMIT = 20;

/** Elser category tags used by explore「灵感发现」. */
const ELSER_WARM_TAGS = [
  "fanart",
  "cp",
  "fantasy",
  "furry",
  "waifu",
  "yandere",
] as const;

/** Elser model chips used across explore families. */
const ELSER_WARM_MODELS = [
  "gpt-image-2",
  "seedream-4-0-250828",
  "gemini-2.5-flash-image",
  "elser-vid-2",
  "elser-vid-2-fast",
  "kling-o3",
  "midjourney",
] as const;

type WarmFeedParams = {
  limit: number;
  cursor?: string;
  featuredOnly?: boolean;
  tag?: string;
  modelId?: string;
  source?: string;
};

/**
 * Background cache warmer for explore feeds.
 * Prefetches the first N pages (cursor chain) so scroll rarely hits a cold upstream.
 * Interval default 3h; set EXPLORE_FEED_WARM_MS=0 to disable.
 */
@Injectable()
export class ExploreFeedWarmer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExploreFeedWarmer.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private readonly intervalMs: number;
  private readonly bootDelayMs: number;
  private readonly warmPages: number;

  constructor(
    private readonly explore: ExploreService,
    config: ConfigService,
  ) {
    this.intervalMs = envMs(config, "EXPLORE_FEED_WARM_MS", 3 * 60 * 60_000);
    this.bootDelayMs = envMs(config, "EXPLORE_FEED_WARM_BOOT_MS", 8_000);
    this.warmPages = envInt(config, "EXPLORE_FEED_WARM_PAGES", 3);
  }

  onModuleInit() {
    if (this.intervalMs <= 0) {
      this.logger.log("Explore feed warmer disabled (EXPLORE_FEED_WARM_MS=0)");
      return;
    }

    this.bootTimer = setTimeout(() => {
      void this.warm("boot");
    }, this.bootDelayMs);
    if (typeof this.bootTimer.unref === "function") this.bootTimer.unref();

    this.timer = setInterval(() => {
      void this.warm("interval");
    }, this.intervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();

    this.logger.log(
      `Explore feed warmer enabled: boot=${this.bootDelayMs}ms interval=${this.intervalMs}ms pages=${this.warmPages}`,
    );
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.timer) clearInterval(this.timer);
    this.bootTimer = null;
    this.timer = null;
  }

  async warm(reason: string): Promise<void> {
    if (this.running) {
      this.logger.debug(`Explore warm skipped (busy) reason=${reason}`);
      return;
    }
    this.running = true;
    const started = Date.now();
    let ok = 0;
    let fail = 0;

    try {
      const jobs: Array<() => Promise<void>> = [];

      for (const src of PROMPT_SOURCES) {
        const id = src.id;
        jobs.push(async () => {
          await this.warmFeedPages({ source: id, limit: WARM_LIMIT });
        });
      }

      jobs.push(async () => {
        await this.warmFeedPages({ featuredOnly: true, limit: WARM_LIMIT });
      });
      jobs.push(async () => {
        await this.warmFeedPages({ limit: WARM_LIMIT });
      });
      for (const tag of ELSER_WARM_TAGS) {
        jobs.push(async () => {
          await this.warmFeedPages({ tag, limit: WARM_LIMIT });
        });
      }
      for (const modelId of ELSER_WARM_MODELS) {
        jobs.push(async () => {
          await this.warmFeedPages({ modelId, limit: WARM_LIMIT });
        });
      }

      // Low concurrency: Civitai/PixAI go through the shared market proxy.
      await mapPool(jobs, 2, async (run) => {
        try {
          await run();
          ok += 1;
        } catch (err) {
          fail += 1;
          this.logger.warn(
            `Explore warm item failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      });

      this.logger.log(
        `Explore warm done reason=${reason} ok=${ok} fail=${fail} pages=${this.warmPages} ms=${Date.now() - started}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Fetch page 1..N following nextCursor so scroll hits warm keys. */
  private async warmFeedPages(base: WarmFeedParams): Promise<void> {
    const pages = Math.max(1, Math.min(this.warmPages, 5));
    let cursor: string | undefined;
    for (let i = 0; i < pages; i++) {
      const result = await this.explore.feed(
        { ...base, cursor },
        { forceRefresh: true },
      );
      if (!result.hasMore || !result.nextCursor?.trim()) break;
      cursor = result.nextCursor.trim();
    }
  }
}

function envMs(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envInt(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}
