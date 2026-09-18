"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Compass, Sparkles } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, isApiCancelError } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import { ExploreDetailDialog } from "./explore-detail-dialog";
import { ExploreMasonry } from "./explore-masonry";
import { ExploreFeedSkeleton } from "./explore-skeleton";
import type { ExploreFeedItem, ExploreFeedResult } from "./types";
import "./explore-home.css";

type CommunityChip = {
  id: string;
  label: string;
  /** Elser 模型流 */
  modelId?: string;
  /** 外部提示词源 */
  source?: string;
};

type ModelFamily = {
  id: string;
  label: string;
  iconName: string;
  communities: CommunityChip[];
};

/** Elser 内容分类（灵感发现） */
const CATEGORIES: Array<{
  id: string;
  label: string;
  featuredOnly?: boolean;
  tag?: string;
}> = [
  { id: "featured", label: "精选", featuredOnly: true },
  { id: "discover", label: "发现" },
  { id: "fanart", label: "IP二创", tag: "fanart" },
  { id: "cp", label: "CP（情侣）", tag: "cp" },
  { id: "fantasy", label: "奇幻", tag: "fantasy" },
  { id: "furry", label: "兽人", tag: "furry" },
  { id: "waifu", label: "老婆", tag: "waifu" },
  { id: "yandere", label: "病娇", tag: "yandere" },
];

/**
 * 顶部：灵感发现 + 模型族。
 * 选中模型后，第二行按社区 / 开源库加载内容。
 */
const MODEL_FAMILIES: ModelFamily[] = [
  {
    id: "gpt-image",
    label: "GPT Image 2",
    iconName: "GPT Image",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "gpt-image-2" },
      { id: "youmind", label: "YouMind", source: "youmind-gpt-image-2" },
      { id: "xianyu", label: "咸鱼", source: "xianyu-awesome-gptimage2" },
      { id: "awesome", label: "Awesome GPT Image", source: "awesome-gpt-image" },
      { id: "gpt4o", label: "GPT-4o Prompts", source: "awesome-gpt4o-image-prompts" },
      { id: "davidwu", label: "DavidWu", source: "davidwu-gpt-image2-prompts" },
      { id: "prompts", label: "Awesome GPT Image 2", source: "gpt-image-2-prompts" },
      { id: "multi", label: "image-prompt-generator", source: "xianyu-multi-model" },
    ],
  },
  {
    id: "seedream",
    label: "Seedream",
    iconName: "Seedream",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "seedream-4-0-250828" },
      { id: "youmind", label: "YouMind Seedream", source: "youmind-seedream-4.5" },
    ],
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    iconName: "Nano Banana",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "gemini-2.5-flash-image" },
      { id: "youmind", label: "YouMind Nano Banana", source: "youmind-nano-banana-pro" },
      { id: "gemini3", label: "YouMind Gemini 3", source: "youmind-gemini-3" },
      { id: "quicker", label: "Banana Quicker", source: "banana-prompt-quicker" },
    ],
  },
  {
    id: "seedance",
    label: "Seedance",
    iconName: "Seedance",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "elser-vid-2" },
      { id: "elser-fast", label: "Elser Fast", modelId: "elser-vid-2-fast" },
      { id: "youmind", label: "YouMind Seedance", source: "youmind-seedance-2" },
      { id: "gallery", label: "Seedance 画廊", source: "ericgood-seedance" },
      { id: "domer", label: "Domer", source: "domer-seedance" },
    ],
  },
  {
    id: "kling",
    label: "Kling",
    iconName: "Kling",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "kling-o3" },
      { id: "domer", label: "Domer Kling", source: "domer-kling" },
    ],
  },
  {
    id: "midjourney",
    label: "Midjourney",
    iconName: "Midjourney",
    communities: [
      { id: "elser", label: "Elser 社区", modelId: "midjourney" },
    ],
  },
  {
    id: "grok",
    label: "Grok Imagine",
    iconName: "Grok",
    communities: [
      { id: "youmind", label: "YouMind Grok Imagine", source: "youmind-grok-imagine" },
      { id: "domer", label: "Domer Grok", source: "domer-grok" },
    ],
  },
  {
    id: "veo",
    label: "Veo",
    iconName: "Veo",
    communities: [
      { id: "domer", label: "Domer Veo", source: "domer-veo" },
    ],
  },
  {
    id: "civitai",
    label: "Civitai",
    iconName: "Stability",
    communities: [
      { id: "hot", label: "Highest Rated", source: "civitai-hot" },
      { id: "download", label: "Most Downloaded", source: "civitai-download" },
      { id: "lora", label: "LoRA", source: "civitai-lora" },
      { id: "newest", label: "Newest", source: "civitai-newest" },
    ],
  },
  {
    id: "pixai",
    label: "PixAI",
    iconName: "Nano Banana",
    communities: [
      { id: "hot", label: "热门模型", source: "pixai-hot" },
      { id: "newest", label: "最新", source: "pixai-newest" },
    ],
  },
];

type MainTab = "feed" | string;

export function ExploreHome() {
  const router = useRouter();
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const [tab, setTab] = useState<MainTab>("feed");
  const [category, setCategory] = useState("featured");
  const [communityId, setCommunityId] = useState(
    MODEL_FAMILIES[0].communities[0].id,
  );
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const activeFamily = useMemo(
    () => MODEL_FAMILIES.find((f) => f.id === tab) ?? null,
    [tab],
  );

  const activeCommunity = useMemo(() => {
    if (!activeFamily) return null;
    return (
      activeFamily.communities.find((c) => c.id === communityId) ??
      activeFamily.communities[0]
    );
  }, [activeFamily, communityId]);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0],
    [category],
  );

  function selectFamily(familyId: string) {
    const family = MODEL_FAMILIES.find((f) => f.id === familyId);
    if (!family) return;
    setTab(familyId);
    setCommunityId(family.communities[0]?.id ?? "");
  }

  const feedKey = useMemo(() => {
    if (tab === "feed") {
      return [
        "explore",
        "feed",
        activeCat.id,
        activeCat.featuredOnly ? "1" : "0",
        activeCat.tag ?? "",
      ] as const;
    }
    return [
      "explore",
      "model",
      tab,
      activeCommunity?.id ?? "",
      activeCommunity?.modelId ?? "",
      activeCommunity?.source ?? "",
    ] as const;
  }, [tab, activeCat, activeCommunity]);

  const feedQuery = useInfiniteQuery({
    queryKey: feedKey,
    initialPageParam: null as string | null,
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: async ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (pageParam) qs.set("cursor", pageParam);

      if (tab === "feed") {
        if (activeCat.featuredOnly) qs.set("featuredOnly", "true");
        if (activeCat.tag) qs.set("tag", activeCat.tag);
      } else if (activeCommunity?.modelId) {
        qs.set("modelId", activeCommunity.modelId);
      } else if (activeCommunity?.source) {
        qs.set("source", activeCommunity.source);
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

  // Buffer ~3 pages on open so a short scroll doesn't wait on upstream.
  // Later pages still come from the sentinel / IntersectionObserver.
  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    if (pageCount < 1 || pageCount >= 3) return;
    void fetchNextPage();
  }, [pageCount, hasMore, loading, loadingMore, fetchNextPage]);

  useEffect(() => {
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
    router.push(`/studio?${qs.toString()}`);
  }

  const emptyTitle =
    tab === "feed" ? "该分类暂无内容" : "该社区暂无内容";
  const emptyDesc =
    tab === "feed"
      ? "换个标签试试，或稍后再刷新。你也可以先去创作页生成作品。"
      : "换个社区试试，或回到灵感发现浏览精选。";

  return (
    <div className="joy-explore" ref={setScrollEl}>
      <div className="joy-explore-inner">
        <header className="joy-explore-header">
          <div className="joy-explore-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "feed"}
              className={cn("joy-explore-tab", tab === "feed" && "is-active")}
              onClick={() => setTab("feed")}
            >
              灵感发现
            </button>
            {MODEL_FAMILIES.map((family) => {
              const icon = modelIconSrc({ name: family.iconName });
              const on = tab === family.id;
              return (
                <button
                  key={family.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={cn(
                    "joy-explore-tab joy-explore-tab-model",
                    on && "is-active",
                  )}
                  onClick={() => selectFamily(family.id)}
                >
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={icon}
                      alt=""
                      className="joy-explore-tab-model-icon"
                    />
                  ) : null}
                  <span>{family.label}</span>
                </button>
              );
            })}
          </div>

          {tab === "feed" ? (
            <div className="joy-explore-cats">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={cn(
                    "joy-explore-cat",
                    category === cat.id && "is-on",
                  )}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          ) : activeFamily ? (
            <div className="joy-explore-cats" role="listbox">
              {activeFamily.communities.map((community) => (
                <button
                  key={community.id}
                  type="button"
                  role="option"
                  aria-selected={activeCommunity?.id === community.id}
                  className={cn(
                    "joy-explore-cat",
                    activeCommunity?.id === community.id && "is-on",
                  )}
                  onClick={() => setCommunityId(community.id)}
                >
                  {community.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>

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
                onClick={() => {
                  setTab("feed");
                  setCategory("featured");
                }}
              >
                查看精选
              </button>
              <button
                type="button"
                className="joy-explore-empty-cta is-ghost"
                onClick={() => router.push("/studio")}
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
              onOpen={setActive}
              onRemix={remix}
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

      <ExploreDetailDialog
        item={active}
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        onRemix={remix}
      />
    </div>
  );
}
