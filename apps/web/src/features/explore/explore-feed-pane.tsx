"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffectOnActive } from "keepalive-for-react";
import { ArrowUp, Compass, Sparkles } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, isApiCancelError } from "@/shared/lib/api";
import { ExploreMasonry } from "./explore-masonry";
import { ExploreFeedSkeleton } from "./explore-skeleton";
import type { ExploreFeedItem, ExploreFeedResult } from "./types";

export type ExplorePaneFeedQuery = {
  kind: "feed";
  categoryId: string;
  featuredOnly?: boolean;
  tag?: string;
  /** Elser model filter under 灵感发现 */
  modelId?: string;
};

export type ExplorePaneModelQuery = {
  kind: "model";
  familyId: string;
  communityId: string;
  modelId?: string;
  source?: string;
};

/** imageprompts.co-style aggregated gallery */
export type ExplorePaneGalleryQuery = {
  kind: "gallery";
  category: string;
  model: string;
  style: string;
  sort: string;
};

export type ExplorePaneQuery =
  | ExplorePaneFeedQuery
  | ExplorePaneModelQuery
  | ExplorePaneGalleryQuery;

type Props = {
  query: ExplorePaneQuery;
  emptyTitle: string;
  emptyDesc: string;
  onOpen: (item: ExploreFeedItem) => void;
  onRemix: (item: ExploreFeedItem) => void;
  onGoFeatured: () => void;
  onGoStudio: () => void;
};

/** Isolated so scroll threshold does not re-render the masonry tree. */
function ExploreBackTop({ scrollEl }: { scrollEl: HTMLDivElement | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = scrollEl;
    if (!el) return;
    let visible = el.scrollTop > 480;
    setShow(visible);
    const onScroll = () => {
      const next = el.scrollTop > 480;
      if (next === visible) return;
      visible = next;
      setShow(next);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollEl]);

  if (!show) return null;
  return (
    <button
      type="button"
      className="joy-explore-back-top"
      aria-label="回到顶部"
      onClick={() => scrollEl?.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  );
}

export function ExploreFeedPane({
  query,
  emptyTitle,
  emptyDesc,
  onOpen,
  onRemix,
  onGoFeatured,
  onGoStudio,
}: Props) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadLockRef = useRef(false);
  const fetchStateRef = useRef({
    hasMore: false,
    loading: false,
    loadingMore: false,
  });

  const feedKey = useMemo(() => {
    if (query.kind === "gallery") {
      return [
        "explore",
        "gallery",
        query.category,
        query.model,
        query.style,
        query.sort,
      ] as const;
    }
    if (query.kind === "feed") {
      return [
        "explore",
        "feed",
        query.categoryId,
        query.featuredOnly ? "1" : "0",
        query.tag ?? "",
        query.modelId ?? "",
      ] as const;
    }
    return [
      "explore",
      "model",
      query.familyId,
      query.communityId,
      query.modelId ?? "",
      query.source ?? "",
    ] as const;
  }, [query]);

  const feedQuery = useInfiniteQuery({
    queryKey: feedKey,
    initialPageParam: null as string | null,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: async ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (pageParam) qs.set("cursor", pageParam);

      if (query.kind === "gallery") {
        qs.set("source", "prompt-gallery");
        if (query.category && query.category !== "all") {
          qs.set("category", query.category);
        }
        if (query.model && query.model !== "all") {
          qs.set("model", query.model);
        }
        if (query.style && query.style !== "all") {
          qs.set("style", query.style);
        }
        if (query.sort) qs.set("sort", query.sort);
      } else if (query.kind === "feed") {
        if (query.featuredOnly) qs.set("featuredOnly", "true");
        if (query.tag) qs.set("tag", query.tag);
        if (query.modelId) qs.set("modelId", query.modelId);
      } else if (query.modelId) {
        qs.set("modelId", query.modelId);
      } else if (query.source) {
        qs.set("source", query.source);
      }

      return api<ExploreFeedResult>(`/explore/feed?${qs}`, { signal });
    },
    getNextPageParam: (last) =>
      last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });

  const items = useMemo(() => {
    const pages = feedQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Set<string>();
    const out: ExploreFeedItem[] = [];
    for (const item of pages) {
      const id = String(item.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(item);
    }
    return out;
  }, [feedQuery.data]);

  const hasMore = Boolean(feedQuery.hasNextPage);
  const loading = feedQuery.isPending;
  const loadingMore = feedQuery.isFetchingNextPage;
  const fetchNextPage = feedQuery.fetchNextPage;
  const pageCount = feedQuery.data?.pages.length ?? 0;
  const hasItems = items.length > 0;

  fetchStateRef.current = { hasMore, loading, loadingMore };

  const tryFetchMore = useCallback(() => {
    const s = fetchStateRef.current;
    if (!s.hasMore || s.loading || s.loadingMore || loadLockRef.current) {
      return;
    }
    loadLockRef.current = true;
    void fetchNextPage().finally(() => {
      loadLockRef.current = false;
    });
  }, [fetchNextPage]);

  useEffect(() => {
    if (!feedQuery.isError || !feedQuery.error) return;
    if (isApiCancelError(feedQuery.error)) return;
    toast.error(
      feedQuery.error instanceof Error
        ? feedQuery.error.message
        : "加载探索内容失败",
    );
  }, [feedQuery.isError, feedQuery.error]);

  // Prefetch one extra page after first paint (idle), not three RTTs up front.
  useEffectOnActive(() => {
    if (loading || loadingMore || !hasMore) return;
    if (pageCount !== 1) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) tryFetchMore();
    };
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1800 });
    } else {
      timeoutId = setTimeout(run, 400);
    }
    return () => {
      cancelled = true;
      if (idleId != null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [pageCount, hasMore, loading, loadingMore, tryFetchMore]);

  // Keep observer mounted across load-more; only rebind when scroll root / feed appear.
  useEffectOnActive(() => {
    const el = sentinelRef.current;
    if (!el || !scrollEl || !hasItems) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        tryFetchMore();
      },
      { root: scrollEl, rootMargin: "600px 0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [scrollEl, tryFetchMore, hasItems]);

  const onOpenStable = useCallback(
    (item: ExploreFeedItem) => onOpen(item),
    [onOpen],
  );
  const onRemixStable = useCallback(
    (item: ExploreFeedItem) => onRemix(item),
    [onRemix],
  );

  return (
    <div className="joy-explore-pane-wrap">
      <div className="joy-explore-pane" ref={setScrollEl}>
        {loading ? (
          <ExploreFeedSkeleton />
        ) : !hasItems ? (
          <div className="joy-explore-empty">
            <Compass className="joy-explore-empty-icon" aria-hidden />
            <h2 className="joy-explore-empty-title">{emptyTitle}</h2>
            <p className="joy-explore-empty-desc">{emptyDesc}</p>
            <div className="joy-explore-empty-actions">
              <button
                type="button"
                className="joy-explore-empty-cta"
                onClick={onGoFeatured}
              >
                查看精选
              </button>
              <button
                type="button"
                className="joy-explore-empty-cta is-ghost"
                onClick={onGoStudio}
              >
                <Sparkles className="h-4 w-4" />
                去创作
              </button>
            </div>
          </div>
        ) : (
          <>
            <ExploreMasonry
              items={items}
              loadingMore={loadingMore}
              onOpen={onOpenStable}
              onRemix={onRemixStable}
            />
            <div className="joy-explore-more">
              {hasMore ? (
                <div
                  ref={sentinelRef}
                  className="joy-explore-sentinel"
                  aria-hidden
                />
              ) : (
                <p className="joy-explore-end">没有更多了</p>
              )}
            </div>
          </>
        )}
      </div>
      <ExploreBackTop scrollEl={scrollEl} />
    </div>
  );
}

export function explorePaneKey(query: ExplorePaneQuery): string {
  if (query.kind === "gallery") {
    return `gallery:${query.category}:${query.model}:${query.style}:${query.sort}`;
  }
  if (query.kind === "feed") {
    return `feed:${query.categoryId}:${query.modelId ?? ""}`;
  }
  return `model:${query.familyId}:${query.communityId}`;
}
