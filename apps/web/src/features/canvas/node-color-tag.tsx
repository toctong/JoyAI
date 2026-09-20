"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Tag } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  COLOR_TAGS,
  colorTagMeta,
  colorTagOf,
  type ColorTagId,
} from "./lib/color-tag";
import { useCanvasStore } from "./store";

type Props = {
  nodeId: string;
  /** Show tag icon when untagged (hover / selected). Badge always if tagged. */
  interactive: boolean;
};

/**
 * Inline color-tag control for the title row — sits right after the name.
 * Multi-select applies the color to the whole selection.
 */
export function NodeColorTagButton({ nodeId, interactive }: Props) {
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const node = useCanvasStore((s) => s.nodes.find((n) => n.id === nodeId));
  const tag = node ? colorTagOf(node) : null;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  useEffect(() => {
    if (!interactive) setOpen(false);
  }, [interactive]);

  if (!tag && !interactive) return null;

  function apply(next: ColorTagId | null) {
    const ids =
      selectedIds.includes(nodeId) && selectedIds.length > 1
        ? selectedIds
        : [nodeId];
    pushHistory();
    for (const id of ids) {
      updateNodeData(id, { colorTag: next ?? "" });
    }
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className="relative shrink-0"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        title={
          tag ? `${colorTagMeta(tag).label}标签 · 点击修改` : "添加颜色标签"
        }
        aria-label={tag ? "修改颜色标签" : "添加颜色标签"}
        aria-expanded={open}
        className={cn(
          "joy-color-tag-trigger grid size-4 place-items-center rounded-full transition",
          tag
            ? "shadow-sm ring-1 ring-background"
            : "border border-foreground/25 bg-background/90 text-muted-foreground hover:text-foreground",
          open && !tag && "border-foreground/40 text-foreground",
        )}
        style={tag ? { background: colorTagMeta(tag).swatch } : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (!interactive && !tag) return;
          setOpen((v) => !v);
        }}
      >
        {tag ? null : <Tag className="size-2.5" strokeWidth={2.25} />}
      </button>

      {open ? (
        <div
          className="joy-canvas-chrome absolute right-0 top-[calc(100%+8px)] z-[80] flex items-center gap-1.5 rounded-full px-2 py-1.5"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            title="清除标签"
            aria-label="清除标签"
            className="grid size-6 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            onClick={() => apply(null)}
          >
            <Ban className="size-3.5" strokeWidth={2} />
          </button>
          {COLOR_TAGS.map((item) => {
            const active = tag === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                aria-pressed={active}
                className={cn(
                  "size-6 rounded-full transition hover:scale-110",
                  active &&
                    "ring-2 ring-foreground/80 ring-offset-2 ring-offset-background",
                )}
                style={{ background: item.swatch }}
                onClick={() => apply(item.id)}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
