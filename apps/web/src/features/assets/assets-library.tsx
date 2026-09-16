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

type Tab = "image" | "video";

type AssetGroup = {
  key: string;
  label: string;
  items: Asset[];
};

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

  const filtered = useMemo(
    () => assets.filter((a) => a.kind === tab),
    [assets, tab],
  );

  const groups = useMemo(() => groupAssets(filtered), [filtered]);

  const previewCreatedLabel = preview
    ? dayjs(preview.createdAt).format("YYYY年M月D日 HH:mm")
    : "";

  return (
    <div className="joy-assets">
      <div className="joy-assets-inner">
        <div className="joy-assets-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "image"}
            className={cn("joy-assets-tab", tab === "image" && "is-active")}
            onClick={() => setTab("image")}
          >
            图片
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "video"}
            className={cn("joy-assets-tab", tab === "video" && "is-active")}
            onClick={() => setTab("video")}
          >
            视频
          </button>
        </div>

        {loading ? (
          <p className="joy-assets-end">加载中…</p>
        ) : filtered.length === 0 ? (
          <div className="joy-assets-empty">
            <p>暂无{tab === "image" ? "图片" : "视频"}</p>
            <p style={{ fontSize: 13, opacity: 0.8 }}>
              去创作页生成第一条内容吧
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.key} className="joy-assets-group">
              <h2 className="joy-assets-group-title">{group.label}</h2>
              <div className="joy-assets-grid">
                {group.items.map((asset) =>
                  tab === "image" ? (
                    <div key={asset.id} className="joy-assets-item">
                      <button
                        type="button"
                        className="joy-assets-card"
                        onClick={() => setPreview(asset)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={asset.url} alt="" loading="lazy" />
                      </button>
                      <LocateLink asset={asset} />
                    </div>
                  ) : (
                    <div key={asset.id} className="joy-assets-item">
                      <button
                        type="button"
                        className="joy-assets-card"
                        onClick={() => setPreview(asset)}
                      >
                        <video
                          src={asset.url}
                          muted
                          preload="metadata"
                          playsInline
                        />
                        <span className="joy-assets-play">
                          <span className="joy-assets-play-dot">
                            <Play fill="currentColor" />
                          </span>
                        </span>
                      </button>
                      <LocateLink asset={asset} />
                    </div>
                  ),
                )}
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
