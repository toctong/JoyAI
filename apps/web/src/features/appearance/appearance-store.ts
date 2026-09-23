"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useMemo, useState, useEffect } from "react";
import { BUILTIN_WALLPAPERS } from "./builtin-wallpapers";
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_WALLPAPER_ID,
  customToWallpaperItem,
  detectWallpaperKind,
  isHttpUrl,
  type CustomWallpaper,
  type WallpaperItem,
} from "./types";

type AppearanceState = {
  wallpaperId: string | null;
  paused: boolean;
  customWallpapers: CustomWallpaper[];
  selectWallpaper: (id: string | null) => void;
  setPaused: (paused: boolean) => void;
  clearWallpaper: () => void;
  addCustomWallpaper: (input: {
    src: string;
    title?: string;
    kind?: "image" | "video";
  }) => { ok: true; id: string } | { ok: false; error: string };
  removeCustomWallpaper: (id: string) => void;
};

function findWallpaper(
  id: string,
  customs: CustomWallpaper[],
): WallpaperItem | undefined {
  const builtin = BUILTIN_WALLPAPERS.find((w) => w.id === id);
  if (builtin) return builtin;
  const custom = customs.find((w) => w.id === id);
  return custom ? customToWallpaperItem(custom) : undefined;
}

function knownId(id: string, customs: CustomWallpaper[]) {
  return (
    BUILTIN_WALLPAPERS.some((w) => w.id === id) ||
    customs.some((w) => w.id === id)
  );
}

export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set, get) => ({
      wallpaperId: null,
      paused: false,
      customWallpapers: [],
      selectWallpaper: (id) => {
        const customs = get().customWallpapers;
        if (id && !knownId(id, customs)) {
          set({ wallpaperId: null, paused: false });
          return;
        }
        set({ wallpaperId: id, paused: false });
      },
      setPaused: (paused) => set({ paused }),
      clearWallpaper: () => set({ wallpaperId: null, paused: false }),
      addCustomWallpaper: ({ src, title, kind }) => {
        const url = src.trim();
        if (!isHttpUrl(url)) {
          return { ok: false, error: "请输入 http(s) 开头的完整 URL" };
        }
        const existing = get().customWallpapers.find((w) => w.src === url);
        if (existing) {
          set({ wallpaperId: existing.id, paused: false });
          return { ok: true, id: existing.id };
        }
        const resolvedKind = kind ?? detectWallpaperKind(url);
        const id = `custom-${Date.now().toString(36)}`;
        const host = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, "");
          } catch {
            return "自定义";
          }
        })();
        const item: CustomWallpaper = {
          id,
          title: (title?.trim() || host).slice(0, 40),
          kind: resolvedKind,
          src: url,
        };
        set((s) => ({
          customWallpapers: [item, ...s.customWallpapers],
          wallpaperId: id,
          paused: false,
        }));
        return { ok: true, id };
      },
      removeCustomWallpaper: (id) => {
        set((s) => {
          const next = s.customWallpapers.filter((w) => w.id !== id);
          const wallpaperId =
            s.wallpaperId === id ? null : s.wallpaperId;
          return {
            customWallpapers: next,
            wallpaperId,
            paused: wallpaperId === null ? false : s.paused,
          };
        });
      },
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      partialize: (s) => ({
        wallpaperId: s.wallpaperId,
        paused: s.paused,
        customWallpapers: s.customWallpapers,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!Array.isArray(state.customWallpapers)) {
          state.customWallpapers = [];
        }
        if (!state.wallpaperId) return;
        if (!knownId(state.wallpaperId, state.customWallpapers)) {
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
  const customs = useAppearanceStore((s) => s.customWallpapers);

  return useMemo(() => {
    const resolved = id ?? DEFAULT_WALLPAPER_ID;
    return (
      findWallpaper(resolved, customs) ??
      findWallpaper(DEFAULT_WALLPAPER_ID, customs) ??
      null
    );
  }, [id, customs]);
}
