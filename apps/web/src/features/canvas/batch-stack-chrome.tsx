"use client";

import type { CanvasNode } from "@joyai/shared";
import { useCanvasStore } from "./store";
import {
  batchChildIdsOf,
  batchRootIdOf,
  isBatchExpanded,
  isBatchRoot,
  setBatchPrimary,
  toggleBatchExpanded,
} from "./lib/batch-group";
import { ChevronDown, ChevronUp, Star } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  visible?: boolean;
};

/** Decorative stack layers + count badge for batch roots; “设为主图” on children. */
export function BatchStackChrome({ node, visible = true }: Props) {
  const nodes = useCanvasStore((s) => s.nodes);
  const root = isBatchRoot(node);
  const rootId = batchRootIdOf(node);
  const childIds = batchChildIdsOf(node);
  const expanded = isBatchExpanded(node);
  const count = Number(node.data.batchCount) || childIds.length + (root ? 1 : 0);
  const primaryId = String(node.data.primaryImageId ?? node.id);
  const isPrimaryChild =
    Boolean(rootId) && primaryId === node.id && !root;

  if (!visible) return null;

  if (root && childIds.length > 0 && !expanded) {
    const layers = Math.min(childIds.length, 3);
    const thumbs = childIds
      .slice(0, layers)
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is CanvasNode => Boolean(n))
      .map((n) => String(n.data.url ?? ""))
      .filter((url) => url && !url.startsWith("data:"));

    return (
      <>
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          {Array.from({ length: layers }).map((_, index) => {
            const depth = layers - index;
            const thumb = thumbs[index];
            return (
              <div
                key={depth}
                className="absolute inset-0 overflow-hidden rounded-md border border-border/70 bg-muted shadow-sm"
                style={{
                  transform: `translate(${depth * 6}px, ${depth * 6}px) scale(${1 - depth * 0.02})`,
                  opacity: 0.55 - index * 0.08,
                }}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          title="展开图片组"
          className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggleBatchExpanded(node.id);
          }}
        >
          <span>{count}</span>
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </>
    );
  }

  if (root && childIds.length > 0 && expanded) {
    return (
      <button
        type="button"
        title="收起图片组"
        className="absolute bottom-2 right-2 z-20 inline-flex items-center gap-1 rounded-full border border-border bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          toggleBatchExpanded(node.id);
        }}
      >
        <span>{count}</span>
        <ChevronUp className="size-3.5 opacity-70" />
      </button>
    );
  }

  if (rootId) {
    return (
      <button
        type="button"
        title={isPrimaryChild ? "当前主图" : "设为主图"}
        className={cn(
          "absolute left-2 top-2 z-20 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur",
          isPrimaryChild
            ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-200"
            : "border-border bg-background/90 text-muted-foreground hover:text-foreground",
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setBatchPrimary(rootId, node.id);
        }}
      >
        <Star
          className={cn("size-3", isPrimaryChild && "fill-current")}
        />
        {isPrimaryChild ? "主图" : "设为主图"}
      </button>
    );
  }

  return null;
}
