"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import { ExploreDetailDialog } from "@/features/explore/explore-detail-dialog";
import {
  ExploreFeedPane,
  explorePaneKey,
  type ExplorePaneQuery,
} from "@/features/explore/explore-feed-pane";
import type { ExploreFeedItem } from "@/features/explore/types";
import { InspireBannerCarousel } from "./inspire-banner-carousel";
import "@/features/explore/explore-home.css";
import "./inspire-home.css";

/** Jimeng-like「最近上新」chips — wired to explore feed tags. */
const SHOWCASE_CATS: Array<{
  id: string;
  label: string;
  featuredOnly?: boolean;
  tag?: string;
}> = [
  { id: "featured", label: "精选", featuredOnly: true },
  { id: "discover", label: "发现" },
  { id: "fanart", label: "IP二创", tag: "fanart" },
  { id: "anime", label: "动画", tag: "anime" },
  { id: "fantasy", label: "奇幻", tag: "fantasy" },
  { id: "film", label: "影视", tag: "film" },
  { id: "design", label: "平面", tag: "design" },
  { id: "commerce", label: "电商", tag: "commerce" },
];

/**
 * Inspire home — promo carousel + showcase feed (Jimeng-style).
 * Composer lives on /studio; top has no greeting / input.
 */
export function InspireHome() {
  const router = useRouter();
  const [category, setCategory] = useState("featured");
  const [detail, setDetail] = useState<ExploreFeedItem | null>(null);

  const activeCat =
    SHOWCASE_CATS.find((c) => c.id === category) ?? SHOWCASE_CATS[0]!;

  const paneQuery = useMemo<ExplorePaneQuery>(
    () => ({
      kind: "feed",
      categoryId: activeCat.id,
      featuredOnly: activeCat.featuredOnly,
      tag: activeCat.tag,
    }),
    [activeCat],
  );

  const remix = useCallback(
    (item: ExploreFeedItem) => {
      const prompt = item.prompt?.trim() || item.title?.trim();
      if (!prompt) return;
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
    },
    [router],
  );

  return (
    <div className="joy-inspire">
      <div className="joy-inspire-inner">
        <header className="joy-inspire-hero">
          <InspireBannerCarousel />
        </header>

        <section className="joy-inspire-showcase" aria-label="最近上新">
          <div className="joy-inspire-showcase-head">
            <h2>最近上新</h2>
            <div className="joy-inspire-cats" role="tablist">
              {SHOWCASE_CATS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={category === cat.id}
                  className={cn(
                    "joy-inspire-cat",
                    category === cat.id && "is-on",
                  )}
                  onClick={() => setCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="joy-inspire-feed">
            <ExploreFeedPane
              key={explorePaneKey(paneQuery)}
              query={paneQuery}
              emptyTitle="暂无作品"
              emptyDesc="换个分类试试，或先去创作页生成。"
              onOpen={setDetail}
              onRemix={remix}
              onGoFeatured={() => setCategory("featured")}
              onGoStudio={() => router.push("/studio")}
            />
          </div>
        </section>
      </div>

      <ExploreDetailDialog
        item={detail}
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onRemix={remix}
      />
    </div>
  );
}
