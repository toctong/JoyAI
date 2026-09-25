"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeepAlive } from "keepalive-for-react";
import { AnimatePresence, motion } from "framer-motion";
import { ListFilter, X } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { modelIconSrc, exploreSiteIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { ScrollableTabs } from "@/shared/ui/scrollable-tabs";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import { ExploreDetailDialog } from "./explore-detail-dialog";
import {
  ExploreFeedPane,
  explorePaneKey,
  type ExplorePaneQuery,
} from "./explore-feed-pane";
import type { ExploreFeedItem } from "./types";
import "./explore-home.css";

type SiteTab = "elser" | "domer" | "civitai" | "pixai";

type Chip = {
  id: string;
  label: string;
  modelId?: string;
  featuredOnly?: boolean;
  tag?: string;
  source?: string;
};

type PromptModel = {
  id: string;
  label: string;
  iconName: string;
  galleryModel: string;
};

const SITE_TABS: Array<{ id: SiteTab; label: string }> = [
  { id: "elser", label: "Elser" },
  { id: "domer", label: "Domer" },
  { id: "civitai", label: "Civitai" },
  { id: "pixai", label: "PixAI" },
];

const ELSER_CHIPS: Chip[] = [
  { id: "featured", label: "精选", featuredOnly: true },
  { id: "discover", label: "发现" },
  { id: "fanart", label: "IP二创", tag: "fanart" },
  { id: "cp", label: "CP（情侣）", tag: "cp" },
  { id: "fantasy", label: "奇幻", tag: "fantasy" },
  { id: "furry", label: "兽人", tag: "furry" },
  { id: "waifu", label: "老婆", tag: "waifu" },
  { id: "yandere", label: "病娇", tag: "yandere" },
  { id: "gpt-image", label: "GPT Image", modelId: "gpt-image-2" },
  { id: "seedream", label: "Seedream", modelId: "seedream-4-0-250828" },
  { id: "nano", label: "Nano Banana", modelId: "gemini-2.5-flash-image" },
  { id: "seedance", label: "Seedance", modelId: "elser-vid-2" },
  { id: "kling", label: "Kling", modelId: "kling-o3" },
  { id: "midjourney", label: "Midjourney", modelId: "midjourney" },
];

const DOMER_CHIPS: Chip[] = [
  { id: "all", label: "全部", source: "domer" },
  { id: "kling", label: "Kling", source: "domer-kling" },
  { id: "seedance", label: "Seedance", source: "domer-seedance" },
  { id: "grok", label: "Grok", source: "domer-grok" },
  { id: "veo", label: "Veo", source: "domer-veo" },
];

const CIVITAI_CHIPS: Chip[] = [
  { id: "hot", label: "Highest Rated", source: "civitai-hot" },
  { id: "download", label: "Most Downloaded", source: "civitai-download" },
  { id: "lora", label: "LoRA", source: "civitai-lora" },
  { id: "newest", label: "Newest", source: "civitai-newest" },
];

const PIXAI_CHIPS: Chip[] = [
  { id: "hot", label: "热门模型", source: "pixai-hot" },
  { id: "newest", label: "最新", source: "pixai-newest" },
];

const PROMPT_MODELS: PromptModel[] = [
  {
    id: "gpt-image",
    label: "GPT Image 2",
    iconName: "GPT Image",
    galleryModel: "gpt-image",
  },
  {
    id: "seedream",
    label: "Seedream",
    iconName: "Seedream",
    galleryModel: "seedream",
  },
  {
    id: "nano-banana",
    label: "Nano Banana",
    iconName: "Nano Banana",
    galleryModel: "nano-banana",
  },
  {
    id: "seedance",
    label: "Seedance",
    iconName: "Seedance",
    galleryModel: "seedance",
  },
  {
    id: "kling",
    label: "Kling",
    iconName: "Kling",
    galleryModel: "kling",
  },
  {
    id: "midjourney",
    label: "Midjourney",
    iconName: "Midjourney",
    galleryModel: "midjourney",
  },
  {
    id: "grok",
    label: "Grok Imagine",
    iconName: "Grok",
    galleryModel: "grok",
  },
  {
    id: "veo",
    label: "Veo",
    iconName: "Veo",
    galleryModel: "veo",
  },
];

const CHIPS_BY_SITE: Record<SiteTab, Chip[]> = {
  elser: ELSER_CHIPS,
  domer: DOMER_CHIPS,
  civitai: CIVITAI_CHIPS,
  pixai: PIXAI_CHIPS,
};

const MONO_ICON_IDS = new Set(["gpt-image", "midjourney", "grok"]);

const KEEP_ALIVE_MAX = 12;

type MainTab =
  | { kind: "site"; id: SiteTab }
  | { kind: "model"; id: string };

export function ExploreHome() {
  const router = useRouter();
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [main, setMain] = useState<MainTab>({ kind: "site", id: "elser" });
  const [chipBySite, setChipBySite] = useState<Record<SiteTab, string>>(() => {
    const init = {} as Record<SiteTab, string>;
    for (const key of Object.keys(CHIPS_BY_SITE) as SiteTab[]) {
      init[key] = CHIPS_BY_SITE[key][0]?.id ?? "";
    }
    return init;
  });

  const siteId = main.kind === "site" ? main.id : null;
  const chips = siteId ? CHIPS_BY_SITE[siteId] : [];
  const defaultChipId = chips[0]?.id ?? "";
  const chipId = siteId ? chipBySite[siteId] || defaultChipId : "";
  const activeChip = useMemo(
    () => chips.find((c) => c.id === chipId) ?? chips[0],
    [chips, chipId],
  );
  const filterActive = Boolean(siteId && chipId && chipId !== defaultChipId);

  const activePromptModel = useMemo(() => {
    if (main.kind !== "model") return null;
    return (
      PROMPT_MODELS.find((m) => m.id === main.id) ?? PROMPT_MODELS[0]!
    );
  }, [main]);

  const scrollKey = main.kind === "site" ? main.id : `model:${main.id}`;

  const paneQuery = useMemo((): ExplorePaneQuery => {
    if (main.kind === "model" && activePromptModel) {
      return {
        kind: "gallery",
        category: "all",
        model: activePromptModel.galleryModel,
        style: "all",
        sort: "trending",
      };
    }
    if (siteId === "elser") {
      return {
        kind: "feed",
        categoryId: activeChip?.id ?? "featured",
        featuredOnly: activeChip?.featuredOnly,
        tag: activeChip?.tag,
        modelId: activeChip?.modelId,
      };
    }
    return {
      kind: "model",
      familyId: siteId ?? "domer",
      communityId: activeChip?.id ?? "",
      source: activeChip?.source,
    };
  }, [main, siteId, activeChip, activePromptModel]);

  const paneKey = explorePaneKey(paneQuery);

  function selectChip(id: string) {
    if (!siteId) return;
    setChipBySite((prev) => ({ ...prev, [siteId]: id }));
    setFilterOpen(false);
  }

  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterOpen]);

  // Close filter when leaving site tabs (models have no chips).
  useEffect(() => {
    if (!siteId && filterOpen) setFilterOpen(false);
  }, [siteId, filterOpen]);

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
    main.kind === "model"
      ? "该模型暂无提示词"
      : siteId === "elser"
        ? "该分类暂无内容"
        : "该来源暂无内容";
  const emptyDesc =
    main.kind === "model"
      ? "换个模型试试，或稍后再刷新。"
      : siteId === "elser"
        ? "换个标签试试，或稍后再刷新。你也可以先去创作页生成作品。"
        : "换个子分类试试，或切换到其他来源。";

  return (
    <div className="joy-explore">
      <header className="joy-explore-header">
        <ScrollableTabs
          className="joy-explore-tabs"
          aria-label="探索分类"
          scrollKey={scrollKey}
        >
          {SITE_TABS.map((item) => {
            const on = main.kind === "site" && main.id === item.id;
            const icon = exploreSiteIconSrc(item.id);
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn(
                  "joy-explore-tab joy-explore-tab-model",
                  on && "is-active",
                )}
                onClick={() => setMain({ kind: "site", id: item.id })}
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    className="joy-explore-tab-model-icon"
                  />
                ) : null}
                <span>{item.label}</span>
              </button>
            );
          })}
          {PROMPT_MODELS.map((model) => {
            const icon = modelIconSrc({ name: model.iconName });
            const on = main.kind === "model" && main.id === model.id;
            return (
              <button
                key={model.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={cn(
                  "joy-explore-tab joy-explore-tab-model",
                  on && "is-active",
                )}
                onClick={() => setMain({ kind: "model", id: model.id })}
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    className={cn(
                      "joy-explore-tab-model-icon",
                      MONO_ICON_IDS.has(model.id) && "is-mono",
                    )}
                  />
                ) : null}
                <span>{model.label}</span>
              </button>
            );
          })}
        </ScrollableTabs>
      </header>

      <div className="joy-explore-panels">
        <KeepAlive
          activeCacheKey={paneKey}
          max={KEEP_ALIVE_MAX}
          containerClassName="joy-explore-keepalive"
          cacheNodeClassName="joy-explore-keepalive-node"
        >
          <ExploreFeedPane
            key={paneKey}
            query={paneQuery}
            emptyTitle={emptyTitle}
            emptyDesc={emptyDesc}
            onOpen={setActive}
            onRemix={remix}
            onGoFeatured={() => {
              setMain({ kind: "site", id: "elser" });
              setChipBySite((prev) => ({ ...prev, elser: "featured" }));
            }}
            onGoStudio={() => router.push("/studio")}
          />
        </KeepAlive>

        {siteId ? (
          <div className="joy-explore-filter">
            <AnimatePresence>
              {filterOpen ? (
                <motion.button
                  key="filter-scrim"
                  type="button"
                  className="joy-explore-filter-scrim"
                  aria-label="关闭筛选"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setFilterOpen(false)}
                />
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {filterOpen ? (
                <motion.div
                  key="filter-panel"
                  className="joy-explore-filter-pop"
                  role="dialog"
                  aria-label="筛选"
                  initial={{ opacity: 0, scale: 0.72, y: 18 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.82, y: 12 }}
                  transition={{
                    type: "spring",
                    stiffness: 420,
                    damping: 28,
                    mass: 0.75,
                  }}
                  style={{ transformOrigin: "bottom left" }}
                >
                  <p className="joy-explore-filter-pop-title">筛选</p>
                  <div
                    className="joy-explore-filter-pop-list"
                    role="listbox"
                    aria-label="子分类"
                  >
                    {chips.map((chip, index) => {
                      const on = activeChip?.id === chip.id;
                      return (
                        <motion.button
                          key={chip.id}
                          type="button"
                          role="option"
                          aria-selected={on}
                          className={cn(
                            "joy-explore-filter-pop-item",
                            on && "is-on",
                          )}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: 0.04 + index * 0.028,
                            duration: 0.22,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          onClick={() => selectChip(chip.id)}
                        >
                          <span>{chip.label}</span>
                          {on ? (
                            <span
                              className="joy-explore-filter-pop-check"
                              aria-hidden
                            >
                              ✓
                            </span>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <motion.button
              type="button"
              className={cn(
                "joy-explore-filter-fab",
                filterActive && "is-active",
                filterOpen && "is-open",
              )}
              aria-label={filterOpen ? "关闭筛选" : "筛选"}
              aria-expanded={filterOpen}
              whileTap={{ scale: 0.92 }}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <AnimatePresence mode="wait" initial={false}>
                {filterOpen ? (
                  <motion.span
                    key="x"
                    className="joy-explore-filter-fab-icon"
                    initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                    transition={{ duration: 0.16 }}
                  >
                    <X className="h-4 w-4" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="filter"
                    className="joy-explore-filter-fab-icon"
                    initial={{ opacity: 0, rotate: 90, scale: 0.6 }}
                    animate={{ opacity: 1, rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, rotate: -90, scale: 0.6 }}
                    transition={{ duration: 0.16 }}
                  >
                    <ListFilter className="h-4 w-4" />
                  </motion.span>
                )}
              </AnimatePresence>
              {filterActive && !filterOpen ? (
                <span className="joy-explore-filter-fab-dot" aria-hidden />
              ) : null}
            </motion.button>
          </div>
        ) : null}
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
