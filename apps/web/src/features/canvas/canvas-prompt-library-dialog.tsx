"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import { CanvasIconClose } from "./icons/canvas-icons";
import {
  fetchGlobalPresets,
  type PromptPreset,
} from "./lib/prompt-presets";
import { ApiError } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";

type Props = {
  open: boolean;
  onClose: () => void;
};

/** 提示词库弹框 — 读取后台全局提示词（运营配置）。 */
export function CanvasPromptLibraryDialog({ open, onClose }: Props) {
  const [items, setItems] = useState<PromptPreset[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setItems([]);
    void fetchGlobalPresets()
      .then((list) => {
        if (cancelled) return;
        setItems(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setItems([]);
        toast.error(e instanceof ApiError ? e.message : "加载提示词失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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
            <h2 className="text-base font-semibold">提示词库</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              后台运营配置的全局提示词
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[88px] animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              暂无提示词，请到后台「提示词库」配置
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/80">
                    <Sparkles className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-tight">
                      {item.title || "未命名"}
                    </div>
                    <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-muted-foreground">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[12px] text-muted-foreground">
            {loading ? "加载中…" : `共 ${items.length} 条`}
          </p>
          <button
            type="button"
            className={cn(
              "h-9 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground",
              "hover:opacity-90",
            )}
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
