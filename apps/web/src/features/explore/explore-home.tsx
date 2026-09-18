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

type MainTab = "feed" | "models" | "sources";

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

/** 开源提示词库（图片 / 视频） */
const PROMPT_LIBRARIES: Array<{
  id: string;
  label: string;
  source: string;
}> = [
  { id: "src-gpt-image-2-prompts", label: "GPT Image 2", source: "gpt-image-2-prompts" },
  { id: "src-awesome-gpt-image", label: "Awesome GPT Image", source: "awesome-gpt-image" },
  {
    id: "src-awesome-gpt4o",
    label: "GPT-4o Prompts",
    source: "awesome-gpt4o-image-prompts",
  },
  {
    id: "src-xianyu",
    label: "咸鱼 GPT Image 2",
    source: "xianyu-awesome-gptimage2",
  },
  {
    id: "src-youmind-gpt",
    label: "YouMind GPT Image 2",
    source: "youmind-gpt-image-2",
  },
  {
    id: "src-youmind-banana",
    label: "Nano Banana Pro",
    source: "youmind-nano-banana-pro",
  },
  {
    id: "src-davidwu",
    label: "DavidWu Prompts",
    source: "davidwu-gpt-image2-prompts",
  },
  {
    id: "src-banana-quicker",
    label: "Banana Quicker",
    source: "banana-prompt-quicker",
  },
  {
    id: "src-xianyu-multi",
    label: "image-prompt-generator",
    source: "xianyu-multi-model",
  },
  {
    id: "src-hiapi-seedance",
    label: "Seedance 视频",
    source: "hiapi-seedance-2",
  },
  {
    id: "src-ericgood-seedance",
    label: "Seedance 画廊",
    source: "ericgood-seedance",
  },
];

/** 热门模型 chips → Elser model_id */
const HOT_MODELS: Array<{
  id: string;
  label: string;
  modelId: string;
}> = [
  { id: "gpt-image-2", label: "GPT Image 2", modelId: "gpt-image-2" },
  {
    id: "seedance-2",
    label: "Seedance 2.0",
    modelId: "elser-vid-2",
  },
  { id: "kling-o3", label: "Kling 3.0", modelId: "kling-o3" },
];

export function ExploreHome() {
  const router = useRouter();
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const [tab, setTab] = useState<MainTab>("feed");
  const [category, setCategory] = useState("featured");
  const [promptLib, setPromptLib] = useState(PROMPT_LIBRARIES[0].id);
  const [hotModel, setHotModel] = useState(HOT_MODELS[0].id);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0],
    [category],
  );

  const activeLib = useMemo(
    () =>
      PROMPT_LIBRARIES.find((c) => c.id === promptLib) ?? PROMPT_LIBRARIES[0],
    [promptLib],
  );

  const activeModel = useMemo(
    () => HOT_MODELS.find((m) => m.id === hotModel) ?? HOT_MODELS[0],
    [hotModel],
  );

  const feedKey = useMemo(() => {
    if (tab === "models") {
      return ["explore", "models", activeModel.modelId] as const;
    }
    if (tab === "sources") {
      return ["explore", "sources", activeLib.source] as const;
    }
    return [
      "explore",
      "feed",
      activeCat.id,
      activeCat.featuredOnly ? "1" : "0",
      activeCat.tag ?? "",
    ] as const;
  }, [tab, activeCat, activeLib, activeModel]);

  const feedQuery = useInfiniteQuery({
    queryKey: feedKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const qs = new URLSearchParams({ limit: "20" });
      if (pageParam) qs.set("cursor", pageParam);

      if (tab === "models") {
        qs.set("modelId", activeModel.modelId);
      } else if (tab === "sources") {
        qs.set("source", activeLib.source);
      } else {
        if (activeCat.featuredOnly) qs.set("featuredOnly", "true");
        if (activeCat.tag) qs.set("tag", activeCat.tag);
      }

      return api<ExploreFeedResult>(`/explore/feed?${qs}`, { signal });
    },
    getNextPageParam: (last) =>
      last.hasMore && last.nextCursor ? last.nextCursor : undefined,
  });

  const items = useMemo(
    () => feedQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [feedQuery.data],
  );
  const hasMore = Boolean(feedQuery.hasNextPage);
  const loading = feedQuery.isPending;
  const loadingMore = feedQuery.isFetchingNextPage;
  const fetchNextPage = feedQuery.fetchNextPage;

  useEffect(() => {
    if (!feedQuery.isError || !feedQuery.error) return;
    if (isApiCancelError(feedQuery.error)) return;
    toast.error(
      feedQuery.error instanceof Error
        ? feedQuery.error.message
        : "加载探索内容失败",
    );
  }, [feedQuery.isError, feedQuery.error]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || !hasMore || loading || loadingMore) return;
        void fetchNextPage();
      },
      { root: null, rootMargin: "480px 0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, fetchNextPage]);

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
    tab === "models"
      ? "该模型暂无内容"
      : tab === "sources"
        ? "该提示词库暂无内容"
        : "该分类暂无内容";
  const emptyDesc =
    tab === "models"
      ? "换个热门模型试试，或回到灵感发现浏览精选。"
      : tab === "sources"
        ? "换个开源库试试，或稍后再刷新。"
        : "换个标签试试，或稍后再刷新。你也可以先去创作页生成作品。";

  return (
    <div className="joy-explore">
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
            <button
              type="button"
              role="tab"
              aria-selected={tab === "models"}
              className={cn("joy-explore-tab", tab === "models" && "is-active")}
              onClick={() => setTab("models")}
            >
              热门模型
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "sources"}
              className={cn(
                "joy-explore-tab",
                tab === "sources" && "is-active",
              )}
              onClick={() => setTab("sources")}
            >
              提示词库
            </button>
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
          ) : tab === "sources" ? (
            <div className="joy-explore-cats" role="listbox">
              {PROMPT_LIBRARIES.map((lib) => (
                <button
                  key={lib.id}
                  type="button"
                  role="option"
                  aria-selected={promptLib === lib.id}
                  className={cn(
                    "joy-explore-cat",
                    promptLib === lib.id && "is-on",
                  )}
                  onClick={() => setPromptLib(lib.id)}
                >
                  {lib.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="joy-explore-models-bar" role="listbox">
              {HOT_MODELS.map((model) => {
                const icon = modelIconSrc({
                  remoteId: model.modelId,
                  name: model.label,
                });
                return (
                  <button
                    key={model.id}
                    type="button"
                    role="option"
                    aria-selected={hotModel === model.id}
                    className={cn(
                      "joy-explore-model-chip",
                      hotModel === model.id && "is-on",
                    )}
                    onClick={() => setHotModel(model.id)}
                  >
                    {icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={icon}
                        alt=""
                        className="joy-explore-model-chip-icon"
                      />
                    ) : null}
                    <span>{model.label}</span>
                  </button>
                );
              })}
            </div>
          )}
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
