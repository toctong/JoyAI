"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Play, WandSparkles } from "lucide-react";
import { CanvasIconClose } from "./icons/canvas-icons";
import type { ExploreFeedItem, ExploreFeedResult } from "@/features/explore/types";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";

type ExploreTab = {
  id: string;
  label: string;
  featuredOnly?: boolean;
  tag?: string;
};

const TABS: ExploreTab[] = [
  { id: "featured", label: "精选", featuredOnly: true },
  { id: "discover", label: "发现" },
  { id: "fanart", label: "IP二创", tag: "fanart" },
  { id: "fantasy", label: "奇幻", tag: "fantasy" },
  { id: "waifu", label: "人像", tag: "waifu" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** 一键同款：把作品落到画布（媒体 + 提示词）。 */
  onRemix: (item: ExploreFeedItem) => void;
};

function thumbOf(item: ExploreFeedItem) {
  return item.thumbnailUrl?.trim() || item.mediaUrl?.trim() || "";
}

function feedUrl(tab: ExploreTab, cursor?: string | null) {
  const qs = new URLSearchParams({ limit: "24" });
  if (tab.featuredOnly) qs.set("featuredOnly", "true");
  if (tab.tag) qs.set("tag", tab.tag);
  if (cursor) qs.set("cursor", cursor);
  return `/explore/feed?${qs.toString()}`;
}

/** 探索弹框 — Tab + 加载更多；一键同款到画布。 */
export function CanvasExploreDialog({ open, onClose, onRemix }: Props) {
  const [tabId, setTabId] = useState(TABS[0]!.id);
  const [items, setItems] = useState<ExploreFeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const activeTab = TABS.find((t) => t.id === tabId) ?? TABS[0]!;

  const loadPage = useCallback(
    async (opts: { reset: boolean; cursor?: string | null }) => {
      if (opts.reset) {
        setLoading(true);
        setItems([]);
        setHasMore(false);
        setCursor(null);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await api<ExploreFeedResult>(
          feedUrl(activeTab, opts.reset ? null : opts.cursor),
        );
        const next = Array.isArray(res?.items) ? res.items : [];
        setItems((prev) => {
          if (opts.reset) return next;
          const seen = new Set(prev.map((i) => i.id));
          const merged = [...prev];
          for (const row of next) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            merged.push(row);
          }
          return merged;
        });
        setCursor(res?.nextCursor ?? null);
        setHasMore(Boolean(res?.hasMore && res?.nextCursor));
      } catch {
        if (opts.reset) setItems([]);
        toast.error("加载探索内容失败");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    if (!open) return;
    setTabId(TABS[0]!.id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void loadPage({ reset: true });
  }, [open, tabId, loadPage]);

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
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">探索</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              一键同款到画布 · 生成媒体节点与提示词
            </p>
          </div>
          <button
            type="button"
            title="关闭"
            aria-label="关闭"
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <CanvasIconClose className="size-4" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 overflow-x-auto px-5 pt-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-sm transition",
                tabId === tab.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setTabId(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 15 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              暂无内容
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
                {items.map((item) => {
                  const src = thumbOf(item);
                  const isVideo = item.type === "video";
                  return (
                    <div
                      key={item.id}
                      className="group relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-border/60"
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      ) : null}
                      {isVideo ? (
                        <span className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white">
                          <Play className="size-3 fill-current" />
                        </span>
                      ) : null}
                      <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/55 via-black/10 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-medium text-foreground shadow-sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRemix(item);
                          }}
                        >
                          <WandSparkles className="size-3.5" />
                          一键同款
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasMore ? (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    disabled={loadingMore}
                    className="h-9 rounded-full border border-border bg-card px-4 text-sm text-foreground transition hover:bg-muted disabled:opacity-50"
                    onClick={() => void loadPage({ reset: false, cursor })}
                  >
                    {loadingMore ? "加载中…" : "加载更多"}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
