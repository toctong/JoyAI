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
import { useCanvasStore } from "./store";
import { isCanvasRefCandidate, canvasRefKindOf } from "./lib/canvas-ref-candidates";
import { nodeTitleLabel } from "./lib/node-chrome";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import { cn } from "@/shared/lib/utils";

type KindFilter = "all" | "text" | "video" | "image" | "audio";

const KIND_TABS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "video", label: "视频" },
  { id: "image", label: "图片" },
  { id: "audio", label: "音频" },
];

function kindOf(node: CanvasNode): KindFilter | null {
  return canvasRefKindOf(node);
}

type Props = {
  open: boolean;
  hostId: string;
  /** e.g. 视频 / 图像 */
  hostLabel?: string;
  onClose: () => void;
  /** Selected canvas node ids to wire as refs. */
  onConfirm: (nodeIds: string[]) => void;
};

/**
 * Pick reference nodes from the current canvas only.
 * Confirm → caller adds edges source→host.
 */
export function CanvasNodeRefDialog({
  open,
  hostId,
  hostLabel = "节点",
  onClose,
  onConfirm,
}: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const setHighlightedIds = useCanvasStore((s) => s.setHighlightedIds);

  const [keyword, setKeyword] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<string[]>([]);

  const candidates = useMemo(
    () => nodes.filter((n) => isCanvasRefCandidate(n, hostId)),
    [nodes, hostId],
  );

  const counts = useMemo(() => {
    const c = { all: 0, text: 0, video: 0, image: 0, audio: 0 };
    for (const n of candidates) {
      const k = kindOf(n);
      if (!k) continue;
      c.all += 1;
      c[k] += 1;
    }
    return c;
  }, [candidates]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return candidates.filter((n) => {
      const k = kindOf(n);
      if (!k) return false;
      if (kind !== "all" && k !== kind) return false;
      if (!q) return true;
      const hay = [
        nodeTitleLabel(n.type, n.data),
        String(n.data.prompt ?? ""),
        String(n.data.text ?? ""),
        String(n.data.originalName ?? ""),
        n.type,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, kind, keyword]);

  useEffect(() => {
    if (!open) {
      setHighlightedIds([]);
      return;
    }
    const linked = edges
      .filter((e) => e.target === hostId)
      .map((e) => e.source)
      .filter((id) => candidates.some((n) => n.id === id));
    setSelected(linked);
    setKeyword("");
    setKind("all");
    setHighlightedIds(candidates.map((n) => n.id));
    return () => setHighlightedIds([]);
  }, [open, hostId, edges, candidates, setHighlightedIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function confirm() {
    onConfirm(selected);
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
        className="joy-node-ref-dialog flex h-[min(640px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">
              为「{hostLabel}」选择参考
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              仅显示画布上已有节点；点选后连线到当前节点，再点一次取消 · Esc
              退出
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              已选 {selected.length}
            </span>
            <button
              type="button"
              className="h-8 rounded-full bg-foreground px-4 text-sm font-medium text-background disabled:opacity-40"
              disabled={!selected.length && !edges.some((e) => e.target === hostId)}
              onClick={confirm}
            >
              完成
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
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 px-5">
          <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-full bg-muted px-3 text-muted-foreground">
            <CanvasIconSearch className="size-3.5 shrink-0" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索素材"
              className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {KIND_TABS.map((tab) => {
              const count = counts[tab.id];
              if (tab.id !== "all" && count === 0) return null;
              return (
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
                  {tab.label} {count}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-auto px-5 pb-5">
          {filtered.length === 0 ? (
            <div className="grid h-full min-h-[200px] place-items-center text-sm text-muted-foreground">
              {candidates.length === 0
                ? "画布上还没有可参考的节点"
                : "没有匹配的节点"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {filtered.map((n) => {
                const on = selected.includes(n.id);
                const k = kindOf(n) ?? "image";
                const url = String(n.data.url ?? "");
                const label = nodeTitleLabel(n.type, n.data);
                const textPreview = String(n.data.text ?? "").trim();
                return (
                  <button
                    key={n.id}
                    type="button"
                    aria-pressed={on}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-[var(--joy-radius-lg)] border bg-card text-left shadow-sm transition",
                      "hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md",
                      on
                        ? "border-foreground ring-2 ring-foreground/15"
                        : "border-border/80",
                    )}
                    onClick={() => toggle(n.id)}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {k === "text" ? (
                        <div className="flex size-full flex-col gap-2 bg-gradient-to-b from-muted/40 to-muted/80 p-3">
                          <p className="min-h-0 flex-1 overflow-hidden text-left text-[length:var(--joy-font-micro)] leading-relaxed text-foreground/85 line-clamp-5">
                            {textPreview || "空文本"}
                          </p>
                        </div>
                      ) : (
                        <CanvasRefThumb
                          kind={n.type}
                          url={url}
                          className="absolute inset-0 size-full object-cover"
                        />
                      )}
                      <span className="pointer-events-none absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-md bg-black/55 text-white backdrop-blur-[2px]">
                        {k === "video" ? (
                          <CanvasIconPlay className="size-3.5" />
                        ) : k === "image" ? (
                          <CanvasIconImage className="size-3.5" />
                        ) : (
                          <CanvasIconFile className="size-3.5" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "pointer-events-none absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full border transition",
                          on
                            ? "border-foreground bg-foreground text-background"
                            : "border-white/70 bg-black/20 text-transparent group-hover:border-white/90",
                        )}
                      >
                        {on ? <CanvasIconCheck className="size-3" /> : null}
                      </span>
                    </div>
                    <div className="flex h-8 shrink-0 items-center border-t border-border/70 bg-card px-2.5">
                      <span className="truncate text-[length:var(--joy-font-micro)] font-medium text-muted-foreground group-hover:text-foreground/80">
                        {label}
                      </span>
                    </div>
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
