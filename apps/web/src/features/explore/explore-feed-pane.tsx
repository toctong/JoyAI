"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
};

export type ExplorePaneModelQuery = {
  kind: "model";
  familyId: string;
  communityId: string;
  modelId?: string;
  source?: string;
};

export type ExplorePaneQuery = ExplorePaneFeedQuery | ExplorePaneModelQuery;

type Props = {
  query: ExplorePaneQuery;
  emptyTitle: string;
  emptyDesc: string;
  onOpen: (item: ExploreFeedItem) => void;
  onRemix: (item: ExploreFeedItem) => void;
  onGoFeatured: () => void;
  onGoStudio: () => void;
};

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
  const [showTop, setShowTop] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const feedKey = useMemo(() => {
    if (query.kind === "feed") {
      return [
        "explore",
        "feed",
        query.categoryId,
        query.featuredOnly ? "1" : "0",
        query.tag ?? "",
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

      if (query.kind === "feed") {
        if (query.featuredOnly) qs.set("featuredOnly", "true");
        if (query.tag) qs.set("tag", query.tag);
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

  useEffect(() => {
    if (!feedQuery.isError || !feedQuery.error) return;
    if (isApiCancelError(feedQuery.error)) return;
    toast.error(
      feedQuery.error instanceof Error
        ? feedQuery.error.message
        : "加载探索内容失败",
    );
  }, [feedQuery.isError, feedQuery.error]);

  // Only while this pane is the active KeepAlive cache node.
  useEffectOnActive(() => {
    if (loading || loadingMore || !hasMore) return;
    if (pageCount < 1 || pageCount >= 3) return;
    void fetchNextPage();
  }, [pageCount, hasMore, loading, loadingMore, fetchNextPage]);

  useEffectOnActive(() => {
    const el = scrollEl;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 480);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollEl]);

  useEffectOnActive(() => {
    const el = sentinelRef.current;
    if (!el || !scrollEl) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || !hasMore || loading || loadingMore) return;
        void fetchNextPage();
      },
      { root: scrollEl, rootMargin: "800px 0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, fetchNextPage, scrollEl]);

  return (
    <div className="joy-explore-pane-wrap">
      <div className="joy-explore-pane" ref={setScrollEl}>
        {loading ? (
          <ExploreFeedSkeleton />
        ) : items.length === 0 ? (
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
              onOpen={onOpen}
              onRemix={onRemix}
            />
            <div className="joy-explore-more">
              {loadingMore ? (
                <span className="sr-only">加载更多中</span>
              ) : hasMore ? (
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
      {showTop ? (
        <button
          type="button"
          className="joy-explore-back-top"
          aria-label="回到顶部"
          onClick={() => scrollEl?.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function explorePaneKey(query: ExplorePaneQuery): string {
  if (query.kind === "feed") return `feed:${query.categoryId}`;
  return `model:${query.familyId}:${query.communityId}`;
}
