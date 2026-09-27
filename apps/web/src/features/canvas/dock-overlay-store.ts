"use client";

import { create } from "zustand";

export type DockOverlayKind = "minimap" | "zoom" | "grid";

type Entry = { kind: DockOverlayKind; w: number; h: number };

type State = {
  active: Entry | null;
  /**
   * Open a dock popover. Closes the previous one and ensures the new panel is
   * strictly larger than the one it replaces (后开 > 先开).
   */
  open: (
    kind: DockOverlayKind,
    baseW: number,
    baseH: number,
  ) => { w: number; h: number };
  close: (kind: DockOverlayKind) => void;
  closeAll: () => void;
};

const GROW = 48;

export const useDockOverlayStore = create<State>((set, get) => ({
  active: null,
  open(kind, baseW, baseH) {
    const { active } = get();
    let w = baseW;
    let h = baseH;
    if (active && active.kind !== kind) {
      w = Math.max(baseW, active.w + GROW);
      h = Math.max(baseH, active.h + GROW);
    }
    const entry = { kind, w, h };
    set({ active: entry });
    return { w, h };
  },
  close(kind) {
    const { active } = get();
    if (active?.kind === kind) set({ active: null });
  },
  closeAll() {
    set({ active: null });
  },
}));
