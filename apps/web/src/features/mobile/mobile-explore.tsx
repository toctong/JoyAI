"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Button,
  Empty,
  Image,
  ImageViewer,
  InfiniteScroll,
  Popup,
  Tag,
} from "antd-mobile";
import {
  Heart,
  Play,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { api, isApiCancelError } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { JoyReleasedVideo } from "@/shared/ui/joy-released-video";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import type { ExploreFeedItem, ExploreFeedResult } from "@/features/explore/types";

const CATEGORIES: Array<{
  id: string;
  label: string;
  featuredOnly?: boolean;
  tag?: string;
}> = [
  { id: "featured", label: "精选", featuredOnly: true },
  { id: "discover", label: "发现" },
  { id: "fanart", label: "IP二创", tag: "fanart" },
  { id: "cp", label: "CP", tag: "cp" },
  { id: "fantasy", label: "奇幻", tag: "fantasy" },
  { id: "furry", label: "兽人", tag: "furry" },
  { id: "waifu", label: "老婆", tag: "waifu" },
  { id: "yandere", label: "病娇", tag: "yandere" },
];

type MediaFilter = "all" | "image" | "video";

const MEDIA_FILTERS: Array<{ id: MediaFilter; label: string }> = [
  { id: "all", label: "全部作品" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
];

function stillPoster(item: ExploreFeedItem): string | null {
  const thumb = item.thumbnailUrl?.trim() || "";
  const media = item.mediaUrl?.trim() || "";
  if (!thumb || thumb === media) return null;
  if (/\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(thumb)) return null;
  return thumb;
}

function coverUrl(item: ExploreFeedItem): string {
  if (item.type === "video") {
    return stillPoster(item) || item.thumbnailUrl || item.mediaUrl || "";
  }
  return item.thumbnailUrl || item.mediaUrl || "";
}

function resolveAspectRatio(item: ExploreFeedItem): string {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    const r = item.width / item.height;
    if (r > 16 / 9) return "16 / 9";
    if (r < 9 / 16) return "9 / 16";
    return `${item.width} / ${item.height}`;
  }
  const ar = item.aspectRatio?.trim();
  if (ar?.includes(":")) {
    const [a, b] = ar.split(":").map((x) => Number(x.trim()));
    if (a > 0 && b > 0) return `${a} / ${b}`;
  }
  return item.type === "video" ? "9 / 16" : "3 / 4";
}

function matchesMediaFilter(item: ExploreFeedItem, filter: MediaFilter) {
  if (filter === "all") return true;
  if (filter === "video") return item.type === "video";
  return item.type !== "video";
}

const SKELETON_ARS = [
  "3 / 4",
  "4 / 5",
  "2 / 3",
  "9 / 16",
  "3 / 4",
  "5 / 6",
  "2 / 3",
  "3 / 4",
];

function ExploreFeedSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="joy-m-explore-grid joy-m-explore-skel-grid"
      aria-busy="true"
      aria-label="加载中"
    >
      {SKELETON_ARS.slice(0, count).map((ar, i) => (
        <div key={i} className="joy-m-explore-skel-card" style={{ aspectRatio: ar }}>
          <span className="joy-m-shimmer" aria-hidden />
        </div>
      ))}
    </div>
  );
}

const ExploreCard = memo(function ExploreCard({
  item,
  onOpen,
}: {
  item: ExploreFeedItem;
  onOpen: (item: ExploreFeedItem) => void;
}) {
  const isVideo = item.type === "video";
  const src = coverUrl(item);
  const title = item.title?.trim() || item.prompt?.trim() || "未命名";
  const ar = resolveAspectRatio(item);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  return (
    <button
      type="button"
      className={cn("joy-m-explore-card", loaded && "is-ready")}
      onClick={() => onOpen(item)}
    >
      <div className="joy-m-explore-card-media" style={{ aspectRatio: ar }}>
        {!loaded && !failed ? (
          <span className="joy-m-explore-card-skel" aria-hidden>
            <span className="joy-m-shimmer" />
          </span>
        ) : null}

        {src && !failed ? (
          <Image
            src={src}
            alt=""
            fit="cover"
            lazy
            placeholder={null}
            fallback={
              <div className="joy-m-explore-card-fallback" aria-hidden />
            }
            className={cn(
              "joy-m-explore-card-img",
              loaded && "is-loaded",
            )}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setFailed(true);
              setLoaded(true);
            }}
          />
        ) : (
          <div className="joy-m-explore-card-empty" />
        )}

        {isVideo && loaded ? (
          <span className="joy-m-explore-card-badge" aria-hidden>
            <Play className="size-3" fill="currentColor" strokeWidth={0} />
            视频
          </span>
        ) : null}
      </div>

      <div className="joy-m-explore-card-foot">
        <p className="joy-m-explore-card-title" title={title}>
          {title}
        </p>
        <span className="joy-m-explore-card-likes">
          <Heart className="size-3" strokeWidth={2} />
          {item.likeCount ?? 0}
        </span>
      </div>
    </button>
  );
});

export function MobileExplorePage() {
  const router = useRouter();
  const [catId, setCatId] = useState("featured");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const [draftFilter, setDraftFilter] = useState<MediaFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const loadLockRef = useRef(false);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0],
    [catId],
  );

  const filterDirty = draftFilter !== mediaFilter;
  const filterActive = mediaFilter !== "all";

  const feedQuery = useInfiniteQuery({
    queryKey: [
      "m-explore",
      "feed",
      activeCat.id,
      activeCat.featuredOnly ? "1" : "0",
      activeCat.tag ?? "",
    ],
    initialPageParam: null as string | null,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: async ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (pageParam) qs.set("cursor", pageParam);
      if (activeCat.featuredOnly) qs.set("featuredOnly", "true");
      if (activeCat.tag) qs.set("tag", activeCat.tag);
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
      if (!matchesMediaFilter(item, mediaFilter)) continue;
      seen.add(id);
      out.push(item);
    }
    return out;
  }, [feedQuery.data, mediaFilter]);

  useEffect(() => {
    if (!feedQuery.isError || !feedQuery.error) return;
    if (isApiCancelError(feedQuery.error)) return;
    toast.error(
      feedQuery.error instanceof Error
        ? feedQuery.error.message
        : "加载探索内容失败",
    );
  }, [feedQuery.isError, feedQuery.error]);

  const loadMore = useCallback(async () => {
    if (
      !feedQuery.hasNextPage ||
      feedQuery.isFetchingNextPage ||
      loadLockRef.current
    ) {
      return;
    }
    loadLockRef.current = true;
    try {
      await feedQuery.fetchNextPage();
    } finally {
      loadLockRef.current = false;
    }
  }, [feedQuery]);

  function openFilter() {
    setDraftFilter(mediaFilter);
    setFilterOpen(true);
  }

  function applyFilter() {
    setMediaFilter(draftFilter);
    setFilterOpen(false);
  }

  function remix(item: ExploreFeedItem) {
    const prompt = item.prompt?.trim() || item.title?.trim();
    if (!prompt) {
      toast.error("没有可用的提示词");
      return;
    }
    setActive(null);
    const refs = (item.referenceUrls ?? [])
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    writeStudioRemixSeed({
      prompt,
      refs,
      type: item.type === "video" ? "video" : "image",
    });
    const qs = new URLSearchParams({ remix: "1" });
    if (item.type === "video") qs.set("type", "video");
    else qs.set("type", "image");
    router.push(`/m/studio?${qs.toString()}`);
  }

  const previewSrc =
    active?.type === "video"
      ? stillPoster(active) || active.mediaUrl
      : active?.mediaUrl || active?.thumbnailUrl;

  return (
    <div className="joy-m-explore">
      <header className="joy-m-content-head">
        <div className="joy-m-content-head-main">
          <Sparkles className="joy-m-content-head-mark" strokeWidth={2} />
          <h2 className="joy-m-content-head-title">探索灵感</h2>
        </div>
        <p className="joy-m-content-head-sub">刷作品 · 一键同款开写</p>
      </header>

      <div className="joy-m-explore-toolbar">
        <button
          type="button"
          className={cn(
            "joy-m-explore-filter-btn",
            filterActive && "is-active",
          )}
          aria-label="筛选"
          onClick={openFilter}
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.9} />
          {filterActive ? <span className="joy-m-explore-filter-dot" /> : null}
        </button>
        <div className="joy-m-explore-chips" role="tablist" aria-label="分类">
          {CATEGORIES.map((c) => {
            const on = catId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn("joy-m-explore-chip", on && "is-active")}
                onClick={() => setCatId(c.id)}
              >
                <span className="joy-m-explore-chip-label">{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="joy-m-explore-body">
        {feedQuery.isPending ? (
          <ExploreFeedSkeleton />
        ) : items.length === 0 ? (
          <Empty
            description={
              filterActive ? "该筛选下暂无内容" : "该分类暂无内容"
            }
            className="joy-m-explore-empty"
          />
        ) : (
          <>
            <div className="joy-m-explore-grid">
              {items.map((item) => (
                <ExploreCard
                  key={item.id}
                  item={item}
                  onOpen={setActive}
                />
              ))}
            </div>
            <InfiniteScroll
              loadMore={loadMore}
              hasMore={Boolean(feedQuery.hasNextPage)}
            >
              {(hasMore) =>
                hasMore ? (
                  <div className="joy-m-explore-more">
                    <span className="joy-m-explore-more-bar">
                      <span className="joy-m-shimmer" aria-hidden />
                    </span>
                    <span className="joy-m-explore-more-bar is-short">
                      <span className="joy-m-shimmer" aria-hidden />
                    </span>
                  </div>
                ) : (
                  <div className="joy-m-explore-end">已经到底了</div>
                )
              }
            </InfiniteScroll>
          </>
        )}
      </div>

      <Popup
        visible={filterOpen}
        onMaskClick={() => setFilterOpen(false)}
        onClose={() => setFilterOpen(false)}
        position="bottom"
        bodyClassName="joy-m-explore-filter-sheet"
        destroyOnClose
      >
        <div className="joy-m-explore-filter">
          <header className="joy-m-explore-filter-top">
            <button
              type="button"
              className="joy-m-explore-filter-close"
              aria-label="关闭"
              onClick={() => setFilterOpen(false)}
            >
              <X className="size-5" strokeWidth={1.9} />
            </button>
            <h3 className="joy-m-explore-filter-title">筛选器</h3>
            <span className="joy-m-explore-filter-top-spacer" />
          </header>

          <div
            className="joy-m-explore-filter-list"
            role="radiogroup"
            aria-label="作品类型"
          >
            {MEDIA_FILTERS.map((opt) => {
              const selected = draftFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={cn(
                    "joy-m-explore-filter-row",
                    selected && "is-selected",
                  )}
                  onClick={() => setDraftFilter(opt.id)}
                >
                  <span className="joy-m-explore-filter-row-label">
                    {opt.label}
                  </span>
                  <span
                    className={cn(
                      "joy-m-explore-filter-radio",
                      selected && "is-on",
                    )}
                    aria-hidden
                  />
                </button>
              );
            })}
          </div>

          <div className="joy-m-explore-filter-foot">
            <button
              type="button"
              className={cn(
                "joy-m-explore-filter-apply",
                filterDirty && "is-ready",
              )}
              disabled={!filterDirty}
              onClick={applyFilter}
            >
              应用
            </button>
          </div>
        </div>
      </Popup>

      <Popup
        visible={Boolean(active)}
        onMaskClick={() => setActive(null)}
        onClose={() => setActive(null)}
        position="bottom"
        bodyClassName="joy-m-explore-popup"
        destroyOnClose
      >
        {active ? (
          <div className="joy-m-explore-detail">
            <div className="joy-m-explore-detail-media">
              {active.type === "video" && active.mediaUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <JoyReleasedVideo
                  className="joy-m-explore-detail-video"
                  src={active.mediaUrl}
                  poster={stillPoster(active) ?? undefined}
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : previewSrc ? (
                <button
                  type="button"
                  className="joy-m-explore-detail-img-btn"
                  onClick={() => ImageViewer.show({ image: previewSrc })}
                >
                  <Image
                    src={previewSrc}
                    alt=""
                    fit="contain"
                    className="joy-m-explore-detail-img"
                  />
                </button>
              ) : null}
            </div>
            <div className="joy-m-explore-detail-body">
              <p
                className="joy-m-explore-detail-prompt"
                title={
                  active.prompt?.trim() || active.title?.trim() || undefined
                }
              >
                {active.prompt?.trim() || active.title?.trim() || "无提示词"}
              </p>
              <div className="joy-m-explore-detail-tags">
                {active.type === "video" ? (
                  <Tag color="primary" fill="outline">
                    视频
                  </Tag>
                ) : (
                  <Tag color="primary" fill="outline">
                    图片
                  </Tag>
                )}
                {active.author?.nickname ? (
                  <Tag fill="outline">{active.author.nickname}</Tag>
                ) : null}
              </div>
              <Button
                color="primary"
                block
                size="large"
                className={cn("joy-m-explore-remix")}
                onClick={() => remix(active)}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <WandSparkles className="size-4" strokeWidth={1.75} />
                  一键同款
                </span>
              </Button>
            </div>
          </div>
        ) : null}
      </Popup>
    </div>
  );
}
