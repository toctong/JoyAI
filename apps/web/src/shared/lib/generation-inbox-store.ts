"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppNotifyAsset } from "@/shared/lib/app-notify-store";

export type GenerationInboxItem = {
  id: string;
  jobId?: string;
  tone: "success" | "error" | "info";
  title: string;
  lines: string[];
  assets?: AppNotifyAsset[];
  href?: string;
  createdAt: number;
  read: boolean;
};

type GenerationInboxState = {
  items: GenerationInboxItem[];
  push: (
    item: Omit<GenerationInboxItem, "id" | "createdAt" | "read"> & {
      id?: string;
      read?: boolean;
    },
  ) => string;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
};

const EMPTY_ITEMS: GenerationInboxItem[] = [];
const MAX_ITEMS = 60;
let seq = 0;

export const useGenerationInboxStore = create<GenerationInboxState>()(
  persist(
    (set, get) => ({
      items: EMPTY_ITEMS,
      push: (item) => {
        const id = item.id ?? `gen-inbox-${Date.now()}-${(seq += 1)}`;
        const next: GenerationInboxItem = {
          id,
          jobId: item.jobId,
          tone: item.tone,
          title: item.title,
          lines: item.lines.filter(Boolean),
          assets: item.assets?.slice(0, 6),
          href: item.href,
          createdAt: Date.now(),
          read: item.read ?? false,
        };
        const prev = get().items.filter((row) => row.id !== id);
        set({
          items: [next, ...prev].slice(0, MAX_ITEMS),
        });
        return id;
      },
      markRead: (id) =>
        set((state) => {
          let changed = false;
          const items = state.items.map((row) => {
            if (row.id !== id || row.read) return row;
            changed = true;
            return { ...row, read: true };
          });
          return changed ? { items } : state;
        }),
      markAllRead: () =>
        set((state) => {
          if (!state.items.some((row) => !row.read)) return state;
          return {
            items: state.items.map((row) =>
              row.read ? row : { ...row, read: true },
            ),
          };
        }),
      remove: (id) =>
        set((state) => {
          const items = state.items.filter((row) => row.id !== id);
          return { items: items.length ? items : EMPTY_ITEMS };
        }),
      clear: () => set({ items: EMPTY_ITEMS }),
    }),
    { name: "joyai-generation-inbox" },
  ),
);

export function pushGenerationInbox(
  item: Omit<GenerationInboxItem, "id" | "createdAt" | "read"> & {
    id?: string;
    read?: boolean;
  },
): string {
  return useGenerationInboxStore.getState().push(item);
}

export function generationInboxUnreadCount(items: GenerationInboxItem[]): number {
  return items.reduce((n, row) => n + (row.read ? 0 : 1), 0);
}
