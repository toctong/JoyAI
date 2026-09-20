"use client";

import { create } from "zustand";
import type { ColorTagId } from "./lib/color-tag";

type ColorTagFocusState = {
  /** Soft-focus nodes with this color tag (does not change selection). */
  focusedTag: ColorTagId | null;
  toggle: (id: ColorTagId) => void;
  clear: () => void;
};

export const useColorTagFocusStore = create<ColorTagFocusState>((set, get) => ({
  focusedTag: null,
  toggle: (id) =>
    set({ focusedTag: get().focusedTag === id ? null : id }),
  clear: () => set({ focusedTag: null }),
}));
