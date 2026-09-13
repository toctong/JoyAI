"use client";

import { useMemo } from "react";
import type { CanvasNode } from "@joyai/shared";
import { groupIdOf, selectionBounds } from "./lib/align";

type Props = {
  nodes: CanvasNode[];
  selectedIds: string[];
};

/** Dashed bounds around active groups when any member is selected. */
export function GroupBoundsOverlay({ nodes, selectedIds }: Props) {
  const boxes = useMemo(() => {
    const selected = new Set(selectedIds);
    const groupIds = new Set<string>();
    for (const n of nodes) {
      if (!selected.has(n.id)) continue;
      const g = groupIdOf(n);
      if (g) groupIds.add(g);
    }
    if (!groupIds.size) return [];
    return [...groupIds].map((gid) => {
      const members = nodes.filter((n) => groupIdOf(n) === gid);
      const b = selectionBounds(members);
      return b ? { gid, ...b } : null;
    }).filter(Boolean) as {
      gid: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }[];
  }, [nodes, selectedIds]);

  if (!boxes.length) return null;

  return (
    <>
      {boxes.map((b) => (
        <div
          key={b.gid}
          className="pointer-events-none absolute rounded-lg border border-dashed border-sky-400/55 bg-sky-400/5"
          style={{
            left: b.x - 8,
            top: b.y - 8,
            width: b.w + 16,
            height: b.h + 16,
          }}
        />
      ))}
    </>
  );
}
