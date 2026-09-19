"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import { groupIdOf, groupLabels, selectionBounds } from "./lib/align";
import { CanvasIconGroup } from "./icons/canvas-icons";
import { useCanvasStore } from "./store";
import { cn } from "@/shared/lib/utils";

const SELECTION_PAD = 14;
export const GROUP_PAD = 32;

type Props = {
  nodes: CanvasNode[];
  selectedIds: string[];
  dropTargetGid?: string | null;
  onGroupTitlePointerDown?: (
    gid: string,
    event: React.PointerEvent,
  ) => void;
};

function GroupName({
  gid,
  label,
  onGroupTitlePointerDown,
}: {
  gid: string;
  label: string;
  onGroupTitlePointerDown?: (
    gid: string,
    event: React.PointerEvent,
  ) => void;
}) {
  const renameGroup = useCanvasStore((s) => s.renameGroup);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  useEffect(() => {
    if (!editing) setDraft(label);
  }, [label, editing]);

  function commit() {
    const next = draft.trim().slice(0, 40);
    setEditing(false);
    if (!next || next === label) {
      setDraft(label);
      return;
    }
    pushHistory();
    renameGroup(gid, next);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="pointer-events-auto absolute left-3 top-0 z-[2] h-5 w-36 -translate-y-[calc(100%+4px)] border-0 border-b border-foreground/30 bg-transparent px-0.5 text-[12px] text-foreground outline-none"
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(label);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      title="拖动移动编组 · 双击改名"
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-auto absolute left-2.5 top-0 z-[2] inline-flex max-w-[220px] -translate-y-[calc(100%+4px)] cursor-grab items-center gap-1 text-[12px] leading-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onGroupTitlePointerDown?.(gid, event);
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDraft(label);
        setEditing(true);
      }}
    >
      <CanvasIconGroup className="size-3.5 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Group fills sit behind nodes. One fully-selected group uses that fill
 * as the selection (no second box). Mixed multi-select still gets a dashed hull.
 */
export function GroupBoundsOverlay({
  nodes,
  selectedIds,
  dropTargetGid = null,
  onGroupTitlePointerDown,
}: Props) {
  const { selectionBox, groups, soleGroupId } = useMemo(() => {
    const labels = groupLabels(nodes);
    const selected = new Set(selectedIds);
    const picked = nodes.filter((n) => selected.has(n.id));
    const selectedGroupIds = new Set<string>();
    for (const n of picked) {
      const g = groupIdOf(n);
      if (g) selectedGroupIds.add(g);
    }

    let soleGroupId: string | null = null;
    if (selectedGroupIds.size === 1 && picked.length >= 2) {
      const gid = [...selectedGroupIds][0]!;
      const members = nodes.filter((n) => groupIdOf(n) === gid);
      if (
        members.length === picked.length &&
        members.every((n) => selected.has(n.id))
      ) {
        soleGroupId = gid;
      }
    }

    const selectionBox =
      !soleGroupId && picked.length >= 2 ? selectionBounds(picked) : null;

    const groups = [...labels.entries()]
      .map(([gid, label]) => {
        const members = nodes.filter((n) => groupIdOf(n) === gid);
        const b = selectionBounds(members);
        return b ? { gid, label, ...b } : null;
      })
      .filter(Boolean) as {
      gid: string;
      label: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[];

    return { selectionBox, groups, soleGroupId };
  }, [nodes, selectedIds]);

  if (!groups.length && !selectionBox) return null;

  return (
    <>
      {groups.map((b) => {
        const isDrop = dropTargetGid === b.gid;
        const isSole = soleGroupId === b.gid;
        return (
          <div
            key={`fill-${b.gid}`}
            className={cn(
              "joy-canvas-group pointer-events-none absolute z-0 rounded-2xl",
              isDrop && "is-drop",
              isSole && "is-selected",
            )}
            style={{
              left: b.x - GROUP_PAD,
              top: b.y - GROUP_PAD,
              width: b.w + GROUP_PAD * 2,
              height: b.h + GROUP_PAD * 2,
            }}
          />
        );
      })}
      {selectionBox ? (
        <div
          className="pointer-events-none absolute z-[20000] rounded-xl border border-dashed border-primary/55 bg-primary/5"
          style={{
            left: selectionBox.x - SELECTION_PAD,
            top: selectionBox.y - SELECTION_PAD,
            width: selectionBox.w + SELECTION_PAD * 2,
            height: selectionBox.h + SELECTION_PAD * 2,
          }}
        />
      ) : null}
      {groups.map((b) => (
        <div
          key={`label-${b.gid}`}
          className="pointer-events-none absolute z-[12000]"
          style={{
            left: b.x - GROUP_PAD,
            top: b.y - GROUP_PAD,
            width: b.w + GROUP_PAD * 2,
            height: 0,
          }}
        >
          <GroupName
            gid={b.gid}
            label={b.label}
            onGroupTitlePointerDown={onGroupTitlePointerDown}
          />
        </div>
      ))}
    </>
  );
}

export { SELECTION_PAD };
