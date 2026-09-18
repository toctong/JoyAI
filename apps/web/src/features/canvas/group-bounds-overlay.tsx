"use client";

import { useMemo } from "react";
import type { CanvasNode } from "@joyai/shared";
import { groupIdOf, selectionBounds } from "./lib/align";

const SELECTION_PAD = 14;
const GROUP_PAD = 8;

type Props = {
  nodes: CanvasNode[];
  selectedIds: string[];
};

/** Dashed hull for multi-select + dashed bounds for active groups. */
export function GroupBoundsOverlay({ nodes, selectedIds }: Props) {
  const { groupBoxes, selectionBox } = useMemo(() => {
    const selected = new Set(selectedIds);
    const groupIds = new Set<string>();
    for (const n of nodes) {
      if (!selected.has(n.id)) continue;
      const g = groupIdOf(n);
      if (g) groupIds.add(g);
    }
    const groupBoxes = [...groupIds]
      .map((gid) => {
        const members = nodes.filter((n) => groupIdOf(n) === gid);
        const b = selectionBounds(members);
        return b ? { gid, ...b } : null;
      })
      .filter(Boolean) as {
      gid: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[];

    const picked = nodes.filter((n) => selected.has(n.id));
    const selectionBox =
      picked.length >= 2 ? selectionBounds(picked) : null;

    return { groupBoxes, selectionBox };
  }, [nodes, selectedIds]);

  if (!groupBoxes.length && !selectionBox) return null;

  return (
    <>
      {selectionBox ? (
        <div
          className="pointer-events-none absolute rounded-xl border border-dashed border-primary/55 bg-primary/5"
          style={{
            left: selectionBox.x - SELECTION_PAD,
            top: selectionBox.y - SELECTION_PAD,
            width: selectionBox.w + SELECTION_PAD * 2,
            height: selectionBox.h + SELECTION_PAD * 2,
          }}
        />
      ) : null}
      {groupBoxes.map((b) => (
        <div
          key={b.gid}
          className="pointer-events-none absolute rounded-lg border border-dashed border-sky-400/55 bg-sky-400/5"
          style={{
            left: b.x - GROUP_PAD,
            top: b.y - GROUP_PAD,
            width: b.w + GROUP_PAD * 2,
            height: b.h + GROUP_PAD * 2,
          }}
        />
      ))}
    </>
  );
}

export { SELECTION_PAD };
