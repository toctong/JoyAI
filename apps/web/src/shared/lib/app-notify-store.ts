"use client";

import { create } from "zustand";

export type AppNotifyAsset = {
  id: string;
  url: string;
  kind?: string;
};

export type AppNotifyItem = {
  id: string;
  tone: "success" | "error" | "info";
  title: string;
  lines: string[];
  assets?: AppNotifyAsset[];
  href?: string;
  actionLabel?: string;
  createdAt: number;
  /** Auto dismiss ms; 0 = sticky until closed. */
  durationMs: number;
};

type AppNotifyState = {
  items: AppNotifyItem[];
  push: (item: Omit<AppNotifyItem, "id" | "createdAt"> & { id?: string }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
};

const EMPTY_ITEMS: AppNotifyItem[] = [];

let seq = 0;

export const useAppNotifyStore = create<AppNotifyState>((set) => ({
  items: EMPTY_ITEMS,
  push: (item) => {
    const id = item.id ?? `notify-${Date.now()}-${(seq += 1)}`;
    const next: AppNotifyItem = {
      id,
      tone: item.tone,
      title: item.title,
      lines: item.lines.filter(Boolean),
      assets: item.assets?.slice(0, 6),
      href: item.href,
      actionLabel: item.actionLabel,
      createdAt: Date.now(),
      durationMs: item.durationMs,
    };
    set((state) => ({
      items: [next, ...state.items].slice(0, 5),
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => {
      const next = state.items.filter((n) => n.id !== id);
      return { items: next.length ? next : EMPTY_ITEMS };
    }),
  clear: () => set({ items: EMPTY_ITEMS }),
}));

export function pushAppNotify(
  item: Omit<AppNotifyItem, "id" | "createdAt"> & { id?: string },
): string {
  return useAppNotifyStore.getState().push(item);
}
