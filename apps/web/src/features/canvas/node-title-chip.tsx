"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";
import { cn } from "@/shared/lib/utils";

/** Floating title chip above a node. Double-click to rename (`data.title`). */
export function NodeTitleChip({
  nodeId,
  label,
  customTitle = "",
  visible,
  className,
}: {
  nodeId: string;
  label: string;
  customTitle?: string;
  visible: boolean;
  className?: string;
}) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customTitle);

  useEffect(() => {
    if (!editing) setDraft(customTitle);
  }, [customTitle, editing]);

  if (!visible && !editing) return null;
  if (!label && !editing) return null;

  function commit() {
    const next = draft.trim().slice(0, 80);
    setEditing(false);
    if (next === customTitle.trim()) return;
    pushHistory();
    updateNodeData(nodeId, { title: next });
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
          "absolute left-0 top-0 z-[4] w-[min(100%,220px)] -translate-y-[calc(100%+6px)] rounded-md border bg-popover px-2 py-0.5 text-[11px] font-medium text-popover-foreground shadow-sm outline-none ring-1 ring-primary",
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
            setDraft(customTitle);
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
        "absolute left-0 top-0 z-[3] max-w-full -translate-y-[calc(100%+6px)] truncate rounded-md bg-popover/95 px-2 py-0.5 text-left text-[11px] font-medium text-popover-foreground shadow-sm ring-1 ring-border",
        className,
      )}
      title="双击改名"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraft(customTitle);
        setEditing(true);
      }}
    >
      {label}
    </button>
  );
}
