"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CanvasIconClose, CanvasIconSearch } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";
import { api, ApiError } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { toast } from "@/shared/lib/toast";
import "./canvas-style-picker.css";

export type StyleTemplateItem = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string;
  tone: string;
};

export type SelectedCanvasStyle = {
  slug: string;
  label: string;
  prompt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  selectedSlug?: string | null;
  onSelect: (style: SelectedCanvasStyle) => void;
  onClear?: () => void;
};

/** 「风格库」— 对齐素材选择弹框；选用后作为标签，不写入输入框。 */
export function CanvasStylePicker({
  open,
  onClose,
  selectedSlug,
  onSelect,
  onClear,
}: Props) {
  const [styles, setStyles] = useState<StyleTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setStyles(await api<StyleTemplateItem[]>("/styles?surface=canvas"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载风格失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = keyword.trim()
    ? styles.filter((item) => {
        const q = keyword.trim().toLowerCase();
        return (
          item.label.toLowerCase().includes(q) ||
          item.prompt.toLowerCase().includes(q) ||
          item.slug.toLowerCase().includes(q)
        );
      })
    : styles;

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
        className="flex h-[min(680px,calc(100vh-48px))] w-[min(960px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <span className="text-base font-semibold">风格库</span>
          <span className="text-sm text-muted-foreground">
            选中后显示为标签，提交时一并带上
          </span>
          {selectedSlug && onClear ? (
            <button
              type="button"
              className="h-8 shrink-0 rounded-full px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              清除风格
            </button>
          ) : null}
          <label className="ml-auto flex h-9 w-52 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索风格"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
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

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : filtered.length === 0 ? (
            <div className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              {styles.length === 0
                ? "暂无可用风格，请到后台「风格库」配置"
                : "没有匹配的风格"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {filtered.map((item) => {
                const active = selectedSlug === item.slug;
                return (
                  <button
                    key={item.id}
                    type="button"
                    title={item.prompt}
                    className={cn(
                      "joy-style-pick-card",
                      active && "is-active",
                    )}
                    onClick={() => {
                      onSelect({
                        slug: item.slug,
                        label: item.label,
                        prompt: item.prompt,
                      });
                      onClose();
                    }}
                  >
                    <span className="joy-style-pick-card__thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={staticAssetUrl(item.thumbUrl)}
                        alt=""
                        className="joy-style-pick-card__img"
                        draggable={false}
                      />
                      <span className="joy-style-pick-card__label">
                        {item.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Append style sentence for the job prompt; keep composer text untouched. */
export function composePromptWithStyle(
  userText: string,
  stylePrompt?: string | null,
) {
  const base = userText.trim();
  const style = stylePrompt?.trim();
  if (!style) return base;
  if (!base) return style;
  if (base.includes(style)) return base;
  return `${base}，${style}`;
}
