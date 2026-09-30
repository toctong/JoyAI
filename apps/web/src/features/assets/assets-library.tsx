"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { Music, Play } from "lucide-react";
import type { AssetSource } from "@joyai/shared";
import { api } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AssetsDetailDialog,
  type AssetsPreviewItem,
} from "./assets-detail-dialog";
import "./assets-library.css";

dayjs.locale("zh-cn");

type Asset = AssetsPreviewItem;

type Tab = "image" | "video" | "audio" | "document" | "upload";
type SourceFilter = "all" | Exclude<AssetSource, "upload">;
type TimeFilter = "all" | "1d" | "7d" | "30d";
type SortFilter = "newest" | "oldest";

type AssetGroup = {
  key: string;
  label: string;
  items: Asset[];
};

const PAGE_SIZE = 48;

function tabToKind(tab: Exclude<Tab, "upload">) {
  return tab === "document" ? "text" : tab;
}

function assetName(asset: Asset) {
  if (typeof asset.originalName === "string" && asset.originalName.trim()) {
    return asset.originalName.trim();
  }
  if (typeof asset.meta?.originalName === "string") {
    return asset.meta.originalName.trim();
  }
  if (typeof asset.meta?.preview === "string" && asset.meta.preview.trim()) {
    return asset.meta.preview.trim().slice(0, 40);
  }
  return asset.kind === "audio" ? "音频" : "文档";
}

function groupLabel(iso: string) {
  const day = dayjs(iso).startOf("day");
  const today = dayjs().startOf("day");
  const diff = today.diff(day, "day");
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return day.format("dddd");
  if (day.year() === today.year()) return day.format("M月D日");
  return day.format("YYYY年M月D日");
}

function groupAssets(list: Asset[]): AssetGroup[] {
  const map = new Map<string, Asset[]>();
  for (const asset of list) {
    const key = dayjs(asset.createdAt).format("YYYY-MM-DD");
    const bucket = map.get(key);
    if (bucket) bucket.push(asset);
    else map.set(key, [asset]);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: groupLabel(key),
    items,
  }));
}

function locateHref(asset: Asset) {
  const projectId = asset.job?.canvasProjectId;
  if (!projectId) return null;
  const q = new URLSearchParams();
  q.set("assetId", asset.id);
  if (asset.job?.id) q.set("jobId", asset.job.id);
  if (asset.job?.canvasNodeId) q.set("nodeId", asset.job.canvasNodeId);
  return `/canvas/${projectId}?${q.toString()}`;
}

function AssetCard({
  asset,
  onOpen,
}: {
  asset: Asset;
  onOpen: () => void;
}) {
  const isVideo = asset.kind === "video";
  const isAudio = asset.kind === "audio";
  const isDoc = asset.kind === "text";

  return (
    <div className="joy-assets-item">
      <button type="button" className="joy-assets-card" onClick={onOpen}>
        {isVideo ? (
          <>
            <JoyVideoPoster
              url={asset.url}
              size="md"
              fallback="video"
              className="size-full object-cover"
            />
            <span className="joy-assets-play">
              <span className="joy-assets-play-dot">
                <Play fill="currentColor" />
              </span>
            </span>
          </>
        ) : isAudio || isDoc ? (
          <span className={cn("joy-assets-file", isAudio && "is-audio")}>
            {isAudio ? (
              <Music className="h-8 w-8" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/icons/doc-file.svg"
                alt=""
                className="joy-assets-doc-icon"
              />
            )}
            <span className="joy-assets-file-name">{assetName(asset)}</span>
          </span>
        ) : (
          <JoyAssetThumb
            url={asset.url}
            size="md"
            className="size-full object-cover"
          />
        )}
      </button>
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "document", label: "文档" },
  { id: "upload", label: "上传" },
];

const SOURCE_OPTIONS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "全部来源" },
  { id: "studio", label: "创作" },
  { id: "canvas", label: "画布" },
  { id: "manju", label: "漫剧" },
  { id: "tools", label: "AI 工具" },
];

const TIME_OPTIONS: { id: TimeFilter; label: string }[] = [
  { id: "all", label: "全部时间" },
  { id: "1d", label: "今天" },
  { id: "7d", label: "近 7 天" },
  { id: "30d", label: "近 30 天" },
];

const SORT_OPTIONS: { id: SortFilter; label: string }[] = [
  { id: "newest", label: "最新优先" },
  { id: "oldest", label: "最早优先" },
];

function emptyCopy(tab: Tab, source: SourceFilter) {
  if (tab === "upload") {
    return {
      title: "暂无上传",
      hint: "在创作、画布、漫剧或工具里上传的参考素材会出现在这里",
    };
  }
  const noun =
    tab === "video"
      ? "视频"
      : tab === "audio"
        ? "音频"
        : tab === "document"
          ? "文档"
          : "图片";
  if (source === "studio") {
    return {
      title: `暂无创作${noun}`,
      hint: "在创作页生成的内容会出现在这里",
    };
  }
  if (source === "canvas") {
    return {
      title: `暂无画布${noun}`,
      hint: "在画布生成或保存的内容会出现在这里",
    };
  }
  if (source === "manju") {
    return {
      title: `暂无漫剧${noun}`,
      hint: "漫剧流程生成的内容会出现在这里",
    };
  }
  if (source === "tools") {
    return {
      title: `暂无 AI 工具${noun}`,
      hint: "在工具页生成的内容会出现在这里",
    };
  }
  if (tab === "audio") {
    return {
      title: "暂无音频",
      hint: "画布或创作生成的音频会出现在这里",
    };
  }
  if (tab === "document") {
    return {
      title: "暂无文档",
      hint: "画布保存或 AI 工具产出的文本文档会出现在这里",
    };
  }
  return {
    title: `暂无${noun}`,
    hint: "去创作、画布、漫剧或 AI 工具生成第一条内容吧",
  };
}

export function AssetsLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tab, setTab] = useState<Tab>("image");
  const [source, setSource] = useState<SourceFilter>("all");
  const [time, setTime] = useState<TimeFilter>("all");
  const [sort, setSort] = useState<SortFilter>("newest");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [preview, setPreview] = useState<Asset | null>(null);
  const skipRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildQuery = useCallback(
    (skip: number) => {
      const qs = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(skip),
        sort,
      });
      if (tab === "upload") {
        qs.set("source", "upload");
      } else {
        qs.set("kind", tabToKind(tab));
        if (source !== "all") qs.set("source", source);
      }
      if (time !== "all") qs.set("from", time);
      return qs;
    },
    [tab, source, time, sort],
  );

  const loadPage = useCallback(
    async (mode: "reset" | "more") => {
      if (mode === "more") {
        if (loadingMoreRef.current || !hasMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
      } else {
        skipRef.current = 0;
        setLoading(true);
      }
      try {
        const skip = mode === "more" ? skipRef.current : 0;
        const list = await api<Asset[]>(`/assets?${buildQuery(skip)}`);
        const rows = Array.isArray(list) ? list : [];
        setAssets((prev) => (mode === "more" ? [...prev, ...rows] : rows));
        skipRef.current = skip + rows.length;
        const more = rows.length >= PAGE_SIZE;
        hasMoreRef.current = more;
        setHasMore(more);
      } finally {
        if (mode === "more") {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [buildQuery],
  );

  useEffect(() => {
    void loadPage("reset");
  }, [loadPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadPage("more");
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadPage, loading, assets.length]);

  useJobLifecycle({
    getBusyJobIds: () => [],
    onAssetUpdated: (payload) => {
      const next = payload.asset;
      if (!next?.id || !next.url) return;
      const id = String(next.id);
      const url = String(next.url);
      setAssets((prev) => {
        const idx = prev.findIndex((a) => a.id === id);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...next, id, url } as Asset;
        return copy;
      });
      setPreview((cur) =>
        cur?.id === id ? ({ ...cur, ...next, id, url } as Asset) : cur,
      );
    },
  });

  const groups = useMemo(() => groupAssets(assets), [assets]);

  const previewCreatedLabel = preview
    ? dayjs(preview.createdAt).format("YYYY年M月D日 HH:mm")
    : "";

  const empty = emptyCopy(tab, source);

  return (
    <div className="joy-assets">
      <div className="joy-assets-inner">
        <div className="joy-assets-toolbar">
          <div className="joy-assets-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={cn("joy-assets-tab", tab === item.id && "is-active")}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="joy-assets-filters">
            {tab !== "upload" ? (
              <Select
                value={source}
                onValueChange={(v) => setSource(v as SourceFilter)}
              >
                <SelectTrigger className="joy-assets-filter">
                  <SelectValue placeholder="来源" />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select
              value={time}
              onValueChange={(v) => setTime(v as TimeFilter)}
            >
              <SelectTrigger className="joy-assets-filter">
                <SelectValue placeholder="时间" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortFilter)}
            >
              <SelectTrigger className="joy-assets-filter">
                <SelectValue placeholder="排序" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <p className="joy-assets-end">加载中…</p>
        ) : assets.length === 0 ? (
          <div className="joy-assets-empty">
            <p>{empty.title}</p>
            <p style={{ fontSize: 13, opacity: 0.8 }}>{empty.hint}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="joy-assets-group">
              <h2 className="joy-assets-group-title">{group.label}</h2>
              <div className="joy-assets-grid">
                {group.items.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    onOpen={() => setPreview(asset)}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <div ref={sentinelRef} className="joy-assets-end" aria-hidden>
          {loadingMore
            ? "加载中…"
            : !loading && assets.length > 0 && !hasMore
              ? "没有更多内容了"
              : null}
        </div>
      </div>

      <AssetsDetailDialog
        asset={preview}
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        createdLabel={previewCreatedLabel}
        locateHref={preview ? locateHref(preview) : null}
      />
    </div>
  );
}
