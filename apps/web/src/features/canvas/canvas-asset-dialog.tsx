"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CanvasIconCheck,
  CanvasIconClose,
  CanvasIconPlay,
  CanvasIconSearch,
} from "./icons/canvas-icons";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";

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

type MainTab = "assets" | "subject";
type KindTab = "image" | "video" | "upload";

const KIND_TABS: { id: KindTab; label: string }[] = [
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "upload", label: "上传" },
];

function isUpload(asset: AssetRow) {
  return !asset.jobId && !asset.job;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (
    assets: {
      id: string;
      url: string;
      kind: string;
      meta?: Record<string, unknown> | null;
      originalName?: string | null;
    }[],
  ) => void;
};

/** Asset picker. Contents match the assets page, not canvas nodes or explore prompts. */
export function CanvasAssetDialog({ open, onClose, onConfirm }: Props) {
  const [main, setMain] = useState<MainTab>("assets");
  const [kind, setKind] = useState<KindTab>("image");
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setMain("assets");
    setKind("image");
    setKeyword("");
    setSelected([]);
    let alive = true;
    setLoading(true);
    void api<AssetRow[]>("/assets?take=200")
      .then((rows) => {
        if (alive) setItems(Array.isArray(rows) ? rows : []);
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return items.filter((asset) => {
      const uploaded = isUpload(asset);
      if (kind === "upload") {
        if (!uploaded) return false;
      } else if (asset.kind !== kind || uploaded) {
        return false;
      }
      if (!q) return true;
      const hay = [asset.id, asset.kind, asset.job?.prompt ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [items, kind, keyword]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function confirm() {
    const picked = items.filter((asset) => selected.includes(asset.id));
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
        className="flex h-[min(680px,calc(100vh-48px))] w-[min(960px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-6 px-6 pt-5">
          <button
            type="button"
            className={cn(
              "text-base font-semibold",
              main === "assets" ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => setMain("assets")}
          >
            资产
          </button>
          <button
            type="button"
            className={cn(
              "rounded-full px-3 py-1 text-sm",
              main === "subject"
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground",
            )}
            onClick={() => setMain("subject")}
          >
            主体
          </button>
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

        <div className="mt-4 flex items-center gap-5 border-b border-border px-6">
          {main === "assets" ? (
            KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={cn(
                  "relative pb-2.5 text-sm",
                  kind === tab.id
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setKind(tab.id)}
              >
                {tab.label}
                {kind === tab.id ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
                ) : null}
              </button>
            ))
          ) : (
            <span className="relative pb-2.5 text-sm font-medium">
              全部
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
            </span>
          )}
          <label className="mb-2 ml-auto flex h-9 w-52 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索"
              disabled={main === "subject"}
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {main === "subject" ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              没有可用主体
            </p>
          ) : loading ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : filtered.length === 0 ? (
            <p className="grid h-full place-items-center text-sm text-muted-foreground">
              {kind === "upload"
                ? "暂无上传资产"
                : kind === "video"
                  ? "暂无生成视频"
                  : "暂无生成图片"}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {filtered.map((asset) => {
                const on = selected.includes(asset.id);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg bg-muted",
                      on && "ring-2 ring-foreground",
                    )}
                    onClick={() => toggle(asset.id)}
                  >
                    {asset.kind === "video" ? (
                      <>
                        <video
                          src={asset.url}
                          muted
                          preload="metadata"
                          playsInline
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.url}
                        alt=""
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
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-sm text-muted-foreground">
            已选择 {main === "assets" ? selected.length : 0} 个素材
          </span>
          <button
            type="button"
            disabled={main !== "assets" || selected.length === 0}
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
