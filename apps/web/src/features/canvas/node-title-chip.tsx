"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useCanvasStore } from "./store";
import { CanvasIconPencil } from "./icons/canvas-icons";
import { cn } from "@/shared/lib/utils";

/** Floating title chip above a node. Drag to move · pencil / double-click to rename. */
export function NodeTitleChip({
  nodeId,
  label,
  customTitle = "",
  visible,
  icon,
  meta,
  className,
  onDragPointerDown,
}: {
  nodeId: string;
  label: string;
  customTitle?: string;
  visible: boolean;
  icon?: ReactNode;
  /** e.g. resolution `2944 × 1648` */
  meta?: string;
  className?: string;
  /** Same contract as group title: start node drag from the title strip. */
  onDragPointerDown?: (event: React.PointerEvent) => void;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customTitle || label);

  useEffect(() => {
    if (!editing) setDraft(customTitle || label);
  }, [customTitle, label, editing]);

  if (!visible && !editing) return null;
  if (!label && !editing) return null;

  function beginEdit() {
    setDraft(customTitle || label);
    setEditing(true);
  }

  function commit() {
    const next = draft.trim().slice(0, 80);
    setEditing(false);
    if (next === customTitle.trim()) return;
    pushHistory();
    updateNodeData(nodeId, { title: next, titleManual: Boolean(next) });
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        placeholder={label}
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className={cn(
          "absolute left-0 top-0 z-[4] w-full -translate-y-[calc(100%+2px)] border-0 border-b border-foreground/30 bg-transparent px-0.5 py-0 text-[12px] text-foreground outline-none",
          className,
        )}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(customTitle || label);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className={cn(
        "absolute left-0 top-0 z-[3] flex w-full -translate-y-[calc(100%+4px)] items-center gap-1 px-0.5 text-[12px] font-normal leading-none text-muted-foreground",
        className,
      )}
    >
      <button
        type="button"
        title="拖动节点 · 双击改名"
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1 bg-transparent text-left hover:text-foreground active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          onDragPointerDown?.(event);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          beginEdit();
        }}
      >
        {icon ? (
          <span className="inline-flex shrink-0 text-muted-foreground [&_svg]:size-3.5">
            {icon}
          </span>
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
      </button>
      {meta ? (
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/80">
          {meta}
        </span>
      ) : null}
      <button
        type="button"
        title="改名"
        aria-label="改名"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-muted/70 hover:text-foreground"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          beginEdit();
        }}
      >
        <CanvasIconPencil className="size-3" />
      </button>
    </div>
  );
}
