"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { Crosshair, Play } from "lucide-react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { cn } from "@/shared/lib/utils";
import {
  AssetsDetailDialog,
  type AssetsPreviewItem,
} from "./assets-detail-dialog";
import "./assets-library.css";

dayjs.locale("zh-cn");

type Asset = AssetsPreviewItem;

type Tab = "image" | "video" | "upload";

type AssetGroup = {
  key: string;
  label: string;
  items: Asset[];
};

function isUploadedAsset(asset: Asset) {
  return !asset.jobId && !asset.job;
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

function LocateLink({ asset }: { asset: Asset }) {
  const href = locateHref(asset);
  if (!href) return null;
  return (
    <Link
      href={href}
      className="joy-assets-locate"
      title="在画布中定位"
      onClick={(e) => e.stopPropagation()}
    >
      <Crosshair className="h-3.5 w-3.5" />
    </Link>
  );
}

function AssetCard({
  asset,
  onOpen,
}: {
  asset: Asset;
  onOpen: () => void;
}) {
  const isVideo = asset.kind === "video";
  return (
    <div className="joy-assets-item">
      <button type="button" className="joy-assets-card" onClick={onOpen}>
        {isVideo ? (
          <>
            <video src={asset.url} muted preload="metadata" playsInline />
            <span className="joy-assets-play">
              <span className="joy-assets-play-dot">
                <Play fill="currentColor" />
              </span>
            </span>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.url} alt="" loading="lazy" />
        )}
      </button>
      <LocateLink asset={asset} />
    </div>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "upload", label: "上传" },
];

function emptyCopy(tab: Tab) {
  if (tab === "upload") {
    return {
      title: "暂无上传资产",
      hint: "创作时上传的参考图会出现在这里",
    };
  }
  if (tab === "video") {
    return {
      title: "暂无生成视频",
      hint: "去创作页生成第一条视频吧",
    };
  }
  return {
    title: "暂无生成图片",
    hint: "去创作页生成第一条图片吧",
  };
}

export function AssetsLibrary() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tab, setTab] = useState<Tab>("image");
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<Asset | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await api<Asset[]>("/assets?take=200");
        if (alive) setAssets(list);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const socket = getJobsSocket();
    const onAssetUpdated = (payload: { asset?: Asset }) => {
      const next = payload.asset;
      if (!next?.id || !next.url) return;
      setAssets((prev) => {
        const idx = prev.findIndex((a) => a.id === next.id);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...next, url: next.url };
        return copy;
      });
      setPreview((cur) =>
        cur?.id === next.id ? { ...cur, ...next, url: next.url } : cur,
      );
    };
    socket.on("asset:updated", onAssetUpdated);
    return () => {
      socket.off("asset:updated", onAssetUpdated);
    };
  }, []);

  const filtered = useMemo(() => {
    if (tab === "upload") {
      return assets.filter(
        (a) => isUploadedAsset(a) && (a.kind === "image" || a.kind === "video"),
      );
    }
    return assets.filter(
      (a) => a.kind === tab && !isUploadedAsset(a),
    );
  }, [assets, tab]);

  const groups = useMemo(() => groupAssets(filtered), [filtered]);

  const previewCreatedLabel = preview
    ? dayjs(preview.createdAt).format("YYYY年M月D日 HH:mm")
    : "";

  const empty = emptyCopy(tab);

  return (
    <div className="joy-assets">
      <div className="joy-assets-inner">
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

        {loading ? (
          <p className="joy-assets-end">加载中…</p>
        ) : filtered.length === 0 ? (
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

        {!loading && filtered.length > 0 ? (
          <p className="joy-assets-end">没有更多内容了</p>
        ) : null}
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
