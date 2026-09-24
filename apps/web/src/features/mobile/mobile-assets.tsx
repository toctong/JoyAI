"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import {
  DotLoading,
  Empty,
  ImageViewer,
  Popup,
  Tag,
} from "antd-mobile";
import { Download, FileText, Music, Play, X } from "lucide-react";
import type { AssetSource } from "@joyai/shared";
import { api, isApiCancelError } from "@/shared/lib/api";
import { downloadAsset } from "@/shared/lib/download-asset";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import type { AssetsPreviewItem } from "@/features/assets/assets-detail-dialog";

dayjs.locale("zh-cn");

type Asset = AssetsPreviewItem;
type Tab = "image" | "video" | "audio" | "document" | "upload";
type SourceFilter = "all" | Exclude<AssetSource, "upload">;

type AssetGroup = {
  key: string;
  label: string;
  items: Asset[];
};

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "document", label: "文档" },
  { id: "upload", label: "上传" },
];

const SOURCE_CHIPS: { id: SourceFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "studio", label: "创作" },
  { id: "tools", label: "工具" },
  { id: "canvas", label: "画布" },
  { id: "manju", label: "漫剧" },
];

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

function emptyCopy(tab: Tab) {
  if (tab === "upload") {
    return {
      title: "还没有上传",
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
  return {
    title: `还没有${noun}`,
    hint: tab === "image" || tab === "video" ? "去创作台生成第一份作品" : "上传或生成后会显示在这里",
  };
}

export function MobileAssetsPage() {
  const [tab, setTab] = useState<Tab>("image");
  const [source, setSource] = useState<SourceFilter>("all");
  const [preview, setPreview] = useState<Asset | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [localAssets, setLocalAssets] = useState<Asset[] | null>(null);

  const query = useQuery({
    queryKey: ["m-assets", tab, source],
    staleTime: 30 * 1000,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({
        take: "200",
        sort: "newest",
      });
      if (tab === "upload") {
        qs.set("source", "upload");
      } else {
        qs.set("kind", tabToKind(tab));
        if (source !== "all") qs.set("source", source);
      }
      return api<Asset[]>(`/assets?${qs}`, { signal });
    },
  });

  useEffect(() => {
    if (query.data) setLocalAssets(query.data);
  }, [query.data]);

  useEffect(() => {
    if (!query.error || isApiCancelError(query.error)) return;
    toast.error(query.error instanceof Error ? query.error.message : "加载失败");
  }, [query.error]);

  useJobLifecycle({
    getBusyJobIds: () => [],
    onAssetUpdated: (payload) => {
      const next = payload.asset;
      if (!next?.id || !next.url) return;
      const id = String(next.id);
      const url = String(next.url);
      setLocalAssets((prev) => {
        if (!prev) return prev;
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

  const assets = localAssets ?? query.data ?? [];
  const groups = useMemo(() => groupAssets(assets), [assets]);
  const empty = emptyCopy(tab);
  const loading = query.isPending && !localAssets;

  const openAsset = (asset: Asset) => {
    setPreview(asset);
    if (asset.kind === "image") {
      setViewerVisible(true);
    }
  };

  const closePreview = () => {
    setViewerVisible(false);
    setPreview(null);
  };

  return (
    <div className="joy-m-assets">
      <div className="joy-m-assets-toolbar">
        <div className="joy-m-explore-chips" role="tablist" aria-label="类型">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={cn("joy-m-explore-chip", tab === item.id && "is-active")}
              onClick={() => {
                setTab(item.id);
                closePreview();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab !== "upload" ? (
          <div className="joy-m-assets-sources" role="tablist" aria-label="来源">
            {SOURCE_CHIPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={source === item.id}
                className={cn(
                  "joy-m-assets-source",
                  source === item.id && "is-active",
                )}
                onClick={() => setSource(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="joy-m-assets-grid is-skel" aria-busy="true" aria-label="加载中">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="joy-m-assets-skel">
              <span className="joy-m-shimmer" aria-hidden />
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="joy-m-assets-empty">
          <Empty description={empty.title} />
          <p className="joy-m-assets-empty-hint">{empty.hint}</p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="joy-m-assets-group">
            <h2 className="joy-m-assets-group-title">{group.label}</h2>
            <div className="joy-m-assets-grid">
              {group.items.map((asset) => {
                const isVideo = asset.kind === "video";
                const isAudio = asset.kind === "audio";
                const isDoc = asset.kind === "text";
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className="joy-m-assets-cell"
                    onClick={() => openAsset(asset)}
                  >
                    {isVideo ? (
                      <>
                        <JoyVideoPoster
                          url={asset.url}
                          size="md"
                          fallback="video"
                          className="joy-m-assets-thumb"
                        />
                        <span className="joy-m-assets-play" aria-hidden>
                          <Play className="size-3.5" fill="currentColor" />
                        </span>
                      </>
                    ) : isAudio || isDoc ? (
                      <span
                        className={cn(
                          "joy-m-assets-file",
                          isAudio && "is-audio",
                        )}
                      >
                        {isAudio ? (
                          <Music className="size-6" strokeWidth={1.6} />
                        ) : (
                          <FileText className="size-6" strokeWidth={1.6} />
                        )}
                        <span className="joy-m-assets-file-name">
                          {assetName(asset)}
                        </span>
                      </span>
                    ) : (
                      <JoyAssetThumb
                        url={asset.url}
                        size="md"
                        className="joy-m-assets-thumb"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      {!loading && assets.length > 0 ? (
        <p className="joy-m-assets-end">没有更多了</p>
      ) : null}

      {query.isFetching && !loading ? (
        <div className="joy-m-assets-refresh">
          <DotLoading color="primary" />
        </div>
      ) : null}

      {preview?.kind === "image" ? (
        <ImageViewer
          image={preview.url}
          visible={viewerVisible}
          onClose={closePreview}
          renderFooter={() => (
            <div className="joy-m-assets-viewer-foot">
              <Tag color="primary" fill="outline" round>
                {dayjs(preview.createdAt).format("M月D日 HH:mm")}
              </Tag>
              <button
                type="button"
                className="joy-m-assets-dl"
                onClick={() => {
                  void downloadAsset(
                    preview.url,
                    preview.kind,
                    assetName(preview),
                  ).catch(() => toast.error("下载失败"));
                }}
              >
                <Download className="size-4" />
                下载
              </button>
            </div>
          )}
        />
      ) : null}

      <Popup
        visible={Boolean(preview) && preview?.kind !== "image"}
        onMaskClick={closePreview}
        onClose={closePreview}
        bodyClassName="joy-m-assets-sheet"
        position="bottom"
      >
        {preview && preview.kind !== "image" ? (
          <div className="joy-m-assets-sheet-inner">
            <div className="joy-m-assets-sheet-head">
              <h3>{assetName(preview)}</h3>
              <button type="button" onClick={closePreview} aria-label="关闭">
                <X className="size-5" />
              </button>
            </div>
            <p className="joy-m-assets-sheet-meta">
              {dayjs(preview.createdAt).format("YYYY年M月D日 HH:mm")}
              {preview.source ? ` · ${preview.source}` : ""}
            </p>
            {preview.kind === "video" ? (
              <div className="joy-m-assets-sheet-media">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={preview.url} controls playsInline />
              </div>
            ) : preview.kind === "audio" ? (
              <div className="joy-m-assets-sheet-media is-audio">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={preview.url} controls />
              </div>
            ) : (
              <p className="joy-m-assets-sheet-text">
                {typeof preview.meta?.preview === "string"
                  ? preview.meta.preview
                  : "文档资产，可下载原文。"}
              </p>
            )}
            <button
              type="button"
              className="joy-m-assets-sheet-dl"
              onClick={() => {
                void downloadAsset(
                  preview.url,
                  preview.kind,
                  assetName(preview),
                ).catch(() => toast.error("下载失败"));
              }}
            >
              <Download className="size-4" />
              下载
            </button>
          </div>
        ) : null}
      </Popup>
    </div>
  );
}
