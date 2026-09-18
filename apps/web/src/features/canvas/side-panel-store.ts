"use client";

import { create } from "zustand";

export const SIDE_PANEL_MIN = 220;
export const SIDE_PANEL_MAX = 420;
export const SIDE_PANEL_DEFAULT = 280;

const WIDTH_KEY = "joyai.canvas.sidePanelWidth";
const OPEN_KEY = "joyai.canvas.sidePanelOpen";

function readWidth() {
  if (typeof window === "undefined") return SIDE_PANEL_DEFAULT;
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    if (!n) return SIDE_PANEL_DEFAULT;
    return Math.min(SIDE_PANEL_MAX, Math.max(SIDE_PANEL_MIN, n));
  } catch {
    return SIDE_PANEL_DEFAULT;
  }
}

function readOpen() {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
}

type SidePanelState = {
  open: boolean;
  width: number;
  setWidth: (width: number) => void;
  persistWidth: () => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCanvasSidePanelStore = create<SidePanelState>((set, get) => ({
  open: true,
  width: SIDE_PANEL_DEFAULT,
  setWidth: (width) =>
    set({
      width: Math.min(SIDE_PANEL_MAX, Math.max(SIDE_PANEL_MIN, width)),
    }),
  persistWidth: () => {
    try {
      localStorage.setItem(WIDTH_KEY, String(get().width));
    } catch {
      /* ignore */
    }
  },
  setOpen: (open) => {
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
    set({ open });
  },
  toggle: () => get().setOpen(!get().open),
}));

export function hydrateSidePanelPrefs() {
  useCanvasSidePanelStore.setState({
    open: readOpen(),
    width: readWidth(),
  });
}
