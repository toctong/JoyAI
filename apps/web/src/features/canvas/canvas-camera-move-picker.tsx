"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Video } from "lucide-react";
import { CanvasIconClose, CanvasIconSearch } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";
import { api, ApiError } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { toast } from "@/shared/lib/toast";
import "./canvas-style-picker.css";

export type CameraMoveItem = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string | null;
  category: string;
  exclusiveGroup: string | null;
};

export type SelectedCameraMove = {
  slug: string;
  label: string;
  prompt: string;
  exclusiveGroup?: string | null;
};

export const CAMERA_MOVE_MAX = 3;

type Props = {
  open: boolean;
  onClose: () => void;
  selected: SelectedCameraMove[];
  onChange: (next: SelectedCameraMove[]) => void;
};

/** Combine moves: max 3; same exclusiveGroup replaces previous. */
export function toggleCameraMove(
  current: SelectedCameraMove[],
  item: SelectedCameraMove,
  max = CAMERA_MOVE_MAX,
): SelectedCameraMove[] {
  const exists = current.find((m) => m.slug === item.slug);
  if (exists) return current.filter((m) => m.slug !== item.slug);

  let next = current;
  const group = item.exclusiveGroup?.trim();
  if (group) {
    next = next.filter((m) => m.exclusiveGroup !== group);
  }
  next = [...next, item];
  if (next.length > max) {
    next = next.slice(next.length - max);
  }
  return next;
}

export function composePromptWithCameraMoves(
  userText: string,
  moves: SelectedCameraMove[],
) {
  const base = userText.trim();
  const parts = moves.map((m) => m.prompt.trim()).filter(Boolean);
  if (!parts.length) return base;
  const moveText = parts.join("; ");
  if (!base) return moveText;
  if (parts.every((p) => base.includes(p))) return base;
  return `${base}, ${moveText}`;
}

/** 「运镜库」— 视频节点；可组合最多 3 个。 */
export function CanvasCameraMovePicker({
  open,
  onClose,
  selected,
  onChange,
}: Props) {
  const [moves, setMoves] = useState<CameraMoveItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("全部");
  const [draft, setDraft] = useState<SelectedCameraMove[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, cats] = await Promise.all([
        api<CameraMoveItem[]>("/camera-moves"),
        api<string[]>("/camera-moves/categories"),
      ]);
      setMoves(rows);
      setCategories(cats);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载运镜失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    setCategory("全部");
    setDraft(selected);
    void reload();
  }, [open, reload, selected]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const tabs = useMemo(() => ["全部", ...categories], [categories]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return moves.filter((item) => {
      if (category !== "全部" && item.category !== category) return false;
      if (!q) return true;
      return (
        item.label.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        item.slug.toLowerCase().includes(q)
      );
    });
  }, [moves, category, keyword]);

  const grouped = useMemo(() => {
    const map = new Map<string, CameraMoveItem[]>();
    for (const item of filtered) {
      const cat = item.category || "其他";
      const list = map.get(cat) ?? [];
      list.push(item);
      map.set(cat, list);
    }
    return [...map.entries()];
  }, [filtered]);

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
          <span className="text-base font-semibold">运镜库</span>
          <span className="text-sm text-muted-foreground">
            可组合最多 {CAMERA_MOVE_MAX} 个，互斥运镜自动替换
          </span>
          <button
            type="button"
            className="ml-auto h-8 rounded-full bg-foreground px-4 text-sm font-medium text-background"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            保存
          </button>
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

        <div className="mt-3 flex flex-wrap items-center gap-2 border-b border-border px-5 pb-3">
          <div className="flex flex-wrap gap-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  "h-8 rounded-full px-3 text-xs font-medium transition",
                  category === tab
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setCategory(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <label className="ml-auto flex h-9 w-52 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索运镜"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {draft.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
            <span className="text-xs text-muted-foreground">
              已选 {draft.length}/{CAMERA_MOVE_MAX}
            </span>
            {draft.map((item) => (
              <button
                key={item.slug}
                type="button"
                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs"
                title="点击移除"
                onClick={() =>
                  setDraft((cur) => cur.filter((m) => m.slug !== item.slug))
                }
              >
                <Video className="size-3 opacity-70" />
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDraft([])}
            >
              清空
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : grouped.length === 0 ? (
            <div className="grid h-full min-h-[240px] place-items-center text-sm text-muted-foreground">
              {moves.length === 0
                ? "暂无运镜，请到后台「运镜库」配置"
                : "没有匹配的运镜"}
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([cat, items]) => (
                <section key={cat}>
                  <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                    {items.map((item) => {
                      const active = draft.some((m) => m.slug === item.slug);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          title={item.prompt}
                          className={cn(
                            "joy-style-pick-card",
                            active && "is-active",
                          )}
                          onClick={() =>
                            setDraft((cur) =>
                              toggleCameraMove(cur, {
                                slug: item.slug,
                                label: item.label,
                                prompt: item.prompt,
                                exclusiveGroup: item.exclusiveGroup,
                              }),
                            )
                          }
                        >
                          <span className="joy-style-pick-card__thumb">
                            {item.thumbUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={staticAssetUrl(item.thumbUrl)}
                                alt=""
                                className="joy-style-pick-card__img"
                                draggable={false}
                              />
                            ) : (
                              <span className="flex size-full items-center justify-center bg-muted">
                                <Camera className="size-8 opacity-30" />
                              </span>
                            )}
                            <span className="joy-style-pick-card__label">
                              {item.label}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
