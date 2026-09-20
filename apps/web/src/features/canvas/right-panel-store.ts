"use client";

import { create } from "zustand";

export type CanvasRightPanelMode = "nodes" | "history" | "agent" | null;

type RightPanelState = {
  mode: CanvasRightPanelMode;
  setMode: (mode: CanvasRightPanelMode) => void;
  toggle: (mode: Exclude<CanvasRightPanelMode, null>) => void;
  close: () => void;
};

export const useCanvasRightPanelStore = create<RightPanelState>((set, get) => ({
  mode: null,
  setMode: (mode) => set({ mode }),
  toggle: (mode) => set({ mode: get().mode === mode ? null : mode }),
  close: () => set({ mode: null }),
}));
