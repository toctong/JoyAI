"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeepAlive } from "keepalive-for-react";
import { toast } from "@/shared/lib/toast";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { cn } from "@/shared/lib/utils";
import { writeStudioRemixSeed } from "@/features/studio/studio-remix-seed";
import { ExploreDetailDialog } from "./explore-detail-dialog";
import {
  ExploreFeedPane,
  explorePaneKey,
  type ExplorePaneQuery,
} from "./explore-feed-pane";
import type { ExploreFeedItem } from "./types";
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

const KEEP_ALIVE_MAX = 12;

export function ExploreHome() {
  const router = useRouter();
  const [active, setActive] = useState<ExploreFeedItem | null>(null);
  const [tab, setTab] = useState<MainTab>("feed");
  const [category, setCategory] = useState("featured");
  /** Remember last community per model family (a-tabs style). */
  const [communityByFamily, setCommunityByFamily] = useState<
    Record<string, string>
  >(() => {
    const init: Record<string, string> = {};
    for (const family of MODEL_FAMILIES) {
      init[family.id] = family.communities[0]?.id ?? "";
    }
    return init;
  });

  const activeFamily = useMemo(
    () => MODEL_FAMILIES.find((f) => f.id === tab) ?? null,
    [tab],
  );

  const communityId =
    (activeFamily && communityByFamily[activeFamily.id]) ||
    activeFamily?.communities[0]?.id ||
    "";

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

  const paneQuery = useMemo((): ExplorePaneQuery => {
    if (tab === "feed") {
      return {
        kind: "feed",
        categoryId: activeCat.id,
        featuredOnly: activeCat.featuredOnly,
        tag: activeCat.tag,
      };
    }
    return {
      kind: "model",
      familyId: tab,
      communityId: activeCommunity?.id ?? "",
      modelId: activeCommunity?.modelId,
      source: activeCommunity?.source,
    };
  }, [tab, activeCat, activeCommunity]);

  const paneKey = explorePaneKey(paneQuery);

  function selectFamily(familyId: string) {
    const family = MODEL_FAMILIES.find((f) => f.id === familyId);
    if (!family) return;
    setTab(familyId);
  }

  function selectCommunity(id: string) {
    if (!activeFamily) return;
    setCommunityByFamily((prev) => ({ ...prev, [activeFamily.id]: id }));
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
    router.push(`/studio?${qs.toString()}`);
  }

  const emptyTitle =
    tab === "feed" ? "该分类暂无内容" : "该社区暂无内容";
  const emptyDesc =
    tab === "feed"
      ? "换个标签试试，或稍后再刷新。你也可以先去创作页生成作品。"
      : "换个社区试试，或回到灵感发现浏览精选。";

  return (
    <div className="joy-explore">
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
                onClick={() => selectCommunity(community.id)}
              >
                {community.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="joy-explore-panels">
        <KeepAlive
          activeCacheKey={paneKey}
          max={KEEP_ALIVE_MAX}
          enableActivity
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
              setTab("feed");
              setCategory("featured");
            }}
            onGoStudio={() => router.push("/studio")}
          />
        </KeepAlive>
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
