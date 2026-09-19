"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useCanvasStore } from "./store";
import { cn } from "@/shared/lib/utils";

/** Floating title chip above a node. Double-click to rename (`data.title`). */
export function NodeTitleChip({
  nodeId,
  label,
  customTitle = "",
  visible,
  icon,
  meta,
  className,
}: {
  nodeId: string;
  label: string;
  customTitle?: string;
  visible: boolean;
  icon?: ReactNode;
  /** e.g. resolution `2944 × 1648` */
  meta?: string;
  className?: string;
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
    <button
      type="button"
      className={cn(
        "absolute left-0 top-0 z-[3] flex w-full -translate-y-[calc(100%+4px)] items-center gap-1 bg-transparent px-0.5 text-left text-[12px] font-normal leading-none text-muted-foreground",
        className,
      )}
      title="双击改名"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraft(customTitle || label);
        setEditing(true);
      }}
    >
      {icon ? (
        <span className="inline-flex shrink-0 text-muted-foreground [&_svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{label}</span>
      {meta ? (
        <span className="ml-auto shrink-0 pl-2 tabular-nums text-[11px] text-muted-foreground/80">
          {meta}
        </span>
      ) : null}
    </button>
  );
}
