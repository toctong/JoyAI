"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Wand2 } from "lucide-react";
import { CanvasIconClose } from "./icons/canvas-icons";
import { api, ApiError } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";

type SkillCategory = "manju" | "canvas" | "tools" | "general";

type SkillPublicRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  purpose: string;
  builtin: boolean;
  sortOrder: number;
};

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  manju: "漫剧",
  canvas: "画布",
  tools: "工具",
  general: "通用",
};

type TabId = "all" | "canvas" | "tools" | "general" | "manju";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "canvas", label: "画布" },
  { id: "tools", label: "工具" },
  { id: "general", label: "通用" },
  { id: "manju", label: "漫剧" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

/** Skill 库弹框 — 读取后台已启用技能目录。 */
export function CanvasSkillLibraryDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<TabId>("all");
  const [items, setItems] = useState<SkillPublicRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setItems([]);
    setTab("all");
    void api<SkillPublicRow[]>("/skills")
      .then((list) => {
        if (cancelled) return;
        setItems(Array.isArray(list) ? list : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setItems([]);
        toast.error(e instanceof ApiError ? e.message : "加载 Skill 失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((item) => item.category === tab);
  }, [items, tab]);

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
            <h2 className="text-base font-semibold">Skill 库</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              后台已启用技能 · 配置见「管理 / 技能」
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
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-sm transition",
                tab === item.id
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[96px] animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              暂无技能，请到后台「技能」配置并启用
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filtered.map((skill) => (
                <div
                  key={skill.id}
                  className="joy-canvas-skill-card flex gap-3 rounded-xl border border-border bg-card p-3.5"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/80">
                    <Wand2 className="size-5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium leading-tight">
                        {skill.name}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        {CATEGORY_LABEL[skill.category]}
                      </span>
                      {skill.builtin ? (
                        <span className="rounded-full bg-primary/12 px-1.5 py-px text-[10px] font-semibold text-primary">
                          内置
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                      {skill.description?.trim() || "暂无描述"}
                    </p>
                    <p className="mt-1.5 font-mono text-[10px] text-muted-foreground/70">
                      {skill.purpose}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-[12px] text-muted-foreground">
            {loading ? "加载中…" : `共 ${filtered.length} 项`}
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
