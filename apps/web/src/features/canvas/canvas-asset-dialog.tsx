"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasNode } from "@joyai/shared";
import {
  CanvasIconCheck,
  CanvasIconClose,
  CanvasIconFile,
  CanvasIconImage,
  CanvasIconPlay,
  CanvasIconSearch,
} from "./icons/canvas-icons";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { useCanvasStore } from "./store";
import { isCanvasRefCandidate } from "./lib/canvas-ref-candidates";
import { nodeTitleLabel } from "./lib/node-chrome";
import { CanvasRefThumb } from "./canvas-ref-thumb";

type AssetRow = {
  id: string;
  kind: string;
  url: string;
  createdAt?: string;
  jobId?: string | null;
  job?: { prompt?: string | null } | null;
  meta?: Record<string, unknown> | null;
  originalName?: string | null;
};

type MainTab = "history" | "library" | "canvas";
type KindTab = "all" | "image" | "video" | "audio";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "history", label: "生成历史" },
  { id: "library", label: "素材库" },
  { id: "canvas", label: "画布资产" },
];

const KIND_TABS: { id: KindTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

function isUpload(asset: AssetRow) {
  return !asset.jobId && !asset.job;
}

function canvasKind(node: CanvasNode): KindTab | null {
  if (node.type === "image" || node.type === "panorama") return "image";
  if (node.type === "video") return "video";
  if (node.type === "audio") return "audio";
  if (node.type === "text") return "all"; // text only under 全部 / dedicated later
  return null;
}

type PickedAsset = {
  id: string;
  url: string;
  kind: string;
  meta?: Record<string, unknown> | null;
  originalName?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (assets: PickedAsset[]) => void;
  /** Enable「画布资产」and wire selected nodes via onConfirmCanvasNodes. */
  canvasHostId?: string;
  onConfirmCanvasNodes?: (nodeIds: string[]) => void;
};

const PAGE = 48;

function listQuery(opts: {
  uploaded: boolean;
  kind: KindTab;
  skip: number;
}) {
  const params = new URLSearchParams({
    take: String(PAGE),
    skip: String(opts.skip),
    uploaded: opts.uploaded ? "1" : "0",
  });
  if (opts.kind !== "all") params.set("kind", opts.kind);
  return `/assets?${params.toString()}`;
}

/** 「选择素材」— 生成历史 / 素材库 / 画布资产. */
export function CanvasAssetDialog({
  open,
  onClose,
  onConfirm,
  canvasHostId,
  onConfirmCanvasNodes,
}: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const [main, setMain] = useState<MainTab>("history");
  const [kind, setKind] = useState<KindTab>("all");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

  const showCanvasTab = Boolean(canvasHostId && onConfirmCanvasNodes);

  const canvasNodes = useMemo(() => {
    if (!canvasHostId) return [];
    return nodes.filter((n) => isCanvasRefCandidate(n, canvasHostId));
  }, [nodes, canvasHostId]);

  useEffect(() => {
    if (!open) return;
    setMain("history");
    setKind("all");
    setKeyword("");
    setSelectedAssets([]);
    setSelectedNodes([]);
  }, [open]);

  useEffect(() => {
    if (!open || main === "canvas") return;
    let alive = true;
    setLoading(true);
    setItems([]);
    setHasMore(false);
    void api<AssetRow[]>(
      listQuery({
        uploaded: main === "library",
        kind,
        skip: 0,
      }),
    )
      .then((rows) => {
        if (!alive) return;
        const next = Array.isArray(rows) ? rows : [];
        setItems(next);
        setHasMore(next.length >= PAGE);
      })
      .catch(() => {
        if (alive) setItems([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, main, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filteredAssets = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((asset) => {
      const uploaded = isUpload(asset);
      if (main === "library" && !uploaded) return false;
      if (main === "history" && uploaded) return false;
      if (kind !== "all" && asset.kind !== kind) return false;
      if (!q) return true;
      const hay = [
        asset.id,
        asset.kind,
        asset.originalName ?? "",
        asset.job?.prompt ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, kind, keyword, main]);

  const filteredCanvas = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return canvasNodes.filter((n) => {
      if (kind === "image" || kind === "video" || kind === "audio") {
        const k = canvasKind(n);
        if (k !== kind) return false;
      }
      if (!q) return true;
      const hay = [
        nodeTitleLabel(n.type, n.data),
        String(n.data.text ?? ""),
        String(n.data.prompt ?? ""),
        n.type,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [canvasNodes, kind, keyword]);

  function toggleAsset(id: string) {
    setSelectedAssets((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleNode(id: string) {
    setSelectedNodes((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function loadMore() {
    if (loading || loadingMore || !hasMore || main === "canvas") return;
    setLoadingMore(true);
    void api<AssetRow[]>(
      listQuery({
        uploaded: main === "library",
        kind,
        skip: items.length,
      }),
    )
      .then((rows) => {
        const next = Array.isArray(rows) ? rows : [];
        setItems((current) => {
          const seen = new Set(current.map((item) => item.id));
          const merged = [...current];
          for (const row of next) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
          }
          return merged;
        });
        setHasMore(next.length >= PAGE);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }

  function confirm() {
    if (main === "canvas") {
      onConfirmCanvasNodes?.(selectedNodes);
      return;
    }
    const picked = items.filter((asset) => selectedAssets.includes(asset.id));
    if (!picked.length) return;
    onConfirm(
      picked.map((asset) => ({
        id: asset.id,
        url: asset.url,
        kind: asset.kind,
        meta: asset.meta,
        originalName: asset.originalName,
      })),
    );
  }

  const selectedCount =
    main === "canvas" ? selectedNodes.length : selectedAssets.length;
  const canConfirm = selectedCount > 0;

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/45 p-6"
      data-canvas-shortcuts-ignore
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="joy-canvas-library-dialog"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-1 px-5 pt-4">
          <span className="mr-3 text-base font-semibold">选择素材</span>
          {MAIN_TABS.map((tab) => {
            if (tab.id === "canvas" && !showCanvasTab) return null;
            return (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "h-8 rounded-full px-3 text-sm transition",
                  main === tab.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setMain(tab.id);
                  setSelectedAssets([]);
                  setSelectedNodes([]);
                }}
              >
                {tab.label}
              </button>
            );
          })}
          <button
            type="button"
            title="关闭"
            aria-label="关闭"
            className="ml-auto grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <CanvasIconClose className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border px-5 pb-3">
          {main === "canvas" ? (
            <span className="h-8 rounded-full bg-muted px-3 text-xs leading-8 text-muted-foreground">
              当前画布
            </span>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium transition",
                  kind === tab.id
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setKind(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <label className="ml-auto flex h-9 w-52 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {main === "canvas" ? (
            filteredCanvas.length === 0 ? (
              <div className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
                {canvasNodes.length === 0
                  ? "画布上还没有可选用的节点"
                  : "没有匹配的节点"}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {filteredCanvas.map((n) => {
                  const on = selectedNodes.includes(n.id);
                  const url = String(n.data.url ?? "");
                  return (
                    <button
                      key={n.id}
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        "relative flex flex-col overflow-hidden rounded-xl border text-left",
                        on
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-border",
                      )}
                      onClick={() => toggleNode(n.id)}
                    >
                      <div className="relative aspect-square bg-muted">
                        {n.type === "text" ? (
                          <div className="flex size-full flex-col gap-1 p-2.5">
                            <CanvasIconFile className="size-4 opacity-60" />
                            <p className="line-clamp-4 text-[11px] leading-snug text-muted-foreground">
                              {String(n.data.text ?? "")}
                            </p>
                          </div>
                        ) : (
                          <CanvasRefThumb
                            kind={n.type}
                            url={url}
                            className="size-full"
                          />
                        )}
                        <span
                          className={cn(
                            "absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-[4px] border",
                            on
                              ? "border-foreground bg-foreground text-background"
                              : "border-white/80 bg-black/25",
                          )}
                        >
                          {on ? <CanvasIconCheck className="size-3" /> : null}
                        </span>
                      </div>
                      <div className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">
                        {nodeTitleLabel(n.type, n.data)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : loading ? (
            <p className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : filteredAssets.length === 0 ? (
            <div className="grid h-full min-h-[240px] place-items-center">
              <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                <span className="grid size-16 place-items-center rounded-2xl border border-dashed border-border bg-muted/40">
                  <CanvasIconImage className="size-6 opacity-50" />
                </span>
                <p>
                  {main === "library"
                    ? "暂无素材"
                    : kind === "video"
                      ? "暂无历史视频"
                      : kind === "audio"
                        ? "暂无历史音频"
                        : "暂无历史资产"}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {filteredAssets.map((asset) => {
                const on = selectedAssets.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg bg-muted",
                      on && "ring-2 ring-foreground",
                    )}
                    onClick={() => toggleAsset(asset.id)}
                  >
                    {asset.kind === "video" ? (
                      <>
                        <JoyVideoPoster
                          url={asset.url}
                          size="sm"
                          fallback="video"
                          className="size-full object-cover"
                        />
                        <span className="pointer-events-none absolute bottom-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-black/55 text-white">
                          <CanvasIconPlay className="size-3" />
                        </span>
                      </>
                    ) : asset.kind === "audio" ? (
                      <span className="grid size-full place-items-center text-xs text-muted-foreground">
                        音频
                      </span>
                    ) : (
                      <JoyAssetThumb
                        url={asset.url}
                        size="sm"
                        className="size-full object-cover"
                        draggable={false}
                      />
                    )}
                    <span
                      className={cn(
                        "absolute left-1.5 top-1.5 grid size-4 place-items-center rounded-[4px] border",
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "border-white/80 bg-black/25",
                      )}
                    >
                      {on ? <CanvasIconCheck className="size-3" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {main !== "canvas" && !loading && hasMore ? (
            <div className="flex justify-center py-4">
              <button
                type="button"
                className="h-8 rounded-full bg-muted px-4 text-sm text-foreground disabled:opacity-60"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-4">
          <span className="text-sm text-muted-foreground">
            已选择 {selectedCount} 个素材
          </span>
          <button
            type="button"
            disabled={!canConfirm}
            className="h-9 rounded-full bg-foreground px-5 text-sm font-medium text-background disabled:bg-muted disabled:text-muted-foreground"
            onClick={confirm}
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
