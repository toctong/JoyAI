"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Sparkles } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { ExploreDetailDialog } from "./explore-detail-dialog";
import { ExploreMasonry } from "./explore-masonry";
import { ExploreFeedSkeleton } from "./explore-skeleton";
import type { ExploreFeedItem, ExploreFeedResult } from "./types";
import "./explore-home.css";

type MainTab = "feed" | "models";

/** 分类直接对应 Elser feed 查询参数，切换即重新拉流 */
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
    modelId: "doubao-seedance-2-5-260628",
  },
  { id: "kling-o3", label: "Kling 3.0", modelId: "kling-o3" },
];

export function ExploreHome() {
  const router = useRouter();
  const [items, setItems] = useState<ExploreFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const [tab, setTab] = useState<MainTab>("feed");
  const [category, setCategory] = useState("featured");
  const [hotModel, setHotModel] = useState(HOT_MODELS[0].id);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const activeCat = useMemo(
    () => CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0],
    [category],
  );

  const activeModel = useMemo(
    () => HOT_MODELS.find((m) => m.id === hotModel) ?? HOT_MODELS[0],
    [hotModel],
  );

  const load = useCallback(
    async (next?: string | null, append = false) => {
      if (append) {
        if (loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      try {
        const qs = new URLSearchParams({ limit: "20" });
        if (next) qs.set("cursor", next);

        if (tab === "models") {
          qs.set("modelId", activeModel.modelId);
        } else {
          if (activeCat.featuredOnly) qs.set("featuredOnly", "true");
          if (activeCat.tag) qs.set("tag", activeCat.tag);
        }

        const res = await api<ExploreFeedResult>(`/explore/feed?${qs}`);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setCursor(res.nextCursor);
        setHasMore(res.hasMore);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载探索内容失败");
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current = false;
      }
    },
    [tab, activeCat, activeModel],
  );

  useEffect(() => {
    void load(null, false);
  }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit || !hasMore || loading || loadingMoreRef.current || !cursor) {
          return;
        }
        void load(cursor, true);
      },
      { root: null, rootMargin: "480px 0px", threshold: 0 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, cursor, load]);

  function remix(item: ExploreFeedItem) {
    const prompt = item.prompt?.trim() || item.title?.trim();
    if (!prompt) {
      toast.error("没有可用的提示词");
      return;
    }
    setActive(null);
    const qs = new URLSearchParams({ prompt });
    if (item.type === "video") qs.set("type", "video");
    router.push(`/studio?${qs.toString()}`);
  }

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
            <h2 className="joy-explore-empty-title">
              {tab === "models" ? "该模型暂无内容" : "该分类暂无内容"}
            </h2>
            <p className="joy-explore-empty-desc">
              {tab === "models"
                ? "换个热门模型试试，或回到灵感发现浏览精选。"
                : "换个标签试试，或稍后再刷新。你也可以先去创作页生成作品。"}
            </p>
            <div className="joy-explore-empty-actions">
              <button
                type="button"
                className="joy-explore-empty-cta"
                onClick={() => {
                  if (tab === "models") setTab("feed");
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
