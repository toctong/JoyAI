"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMemo, useState, useEffect } from "react";
import { BUILTIN_WALLPAPERS } from "./builtin-wallpapers";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_WALLPAPER_ID,
  type WallpaperItem,
} from "./types";

type AppearanceState = {
  wallpaperId: string | null;
  paused: boolean;
  selectWallpaper: (id: string | null) => void;
  setPaused: (paused: boolean) => void;
  clearWallpaper: () => void;
};

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      wallpaperId: null,
      paused: false,
      selectWallpaper: (id) => {
        // Ignore legacy upload ids / removed builtins
        if (id && !BUILTIN_WALLPAPERS.some((w) => w.id === id)) {
          set({ wallpaperId: null, paused: false });
          return;
        }
        set({ wallpaperId: id, paused: false });
      },
      setPaused: (paused) => set({ paused }),
      clearWallpaper: () => set({ wallpaperId: null, paused: false }),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      partialize: (s) => ({
        wallpaperId: s.wallpaperId,
        paused: s.paused,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state?.wallpaperId) return;
        if (!BUILTIN_WALLPAPERS.some((w) => w.id === state.wallpaperId)) {
          state.wallpaperId = null;
          state.paused = false;
        }
      },
    },
  ),
);

export function useAppearanceHydrated() {
  const [hydrated, setHydrated] = useState(() =>
    typeof window === "undefined"
      ? false
      : useAppearanceStore.persist.hasHydrated(),
  );

  useEffect(() => {
    setHydrated(useAppearanceStore.persist.hasHydrated());
    return useAppearanceStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
  }, []);

  return hydrated;
}

export function useActiveWallpaper(): WallpaperItem | null {
  const id = useAppearanceStore((s) => s.wallpaperId);

  return useMemo(() => {
    const resolved = id ?? DEFAULT_WALLPAPER_ID;
    return (
      BUILTIN_WALLPAPERS.find((w) => w.id === resolved) ??
      BUILTIN_WALLPAPERS.find((w) => w.id === DEFAULT_WALLPAPER_ID) ??
      null
    );
  }, [id]);
}
