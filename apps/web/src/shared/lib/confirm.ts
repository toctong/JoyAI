"use client";

import { create } from "zustand";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（删除等）用红色确认按钮 */
  destructive?: boolean;
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,
  ask(options) {
    return new Promise<boolean>((resolve) => {
      const prev = get().resolve;
      if (prev) prev(false);
      set({ open: true, options, resolve });
    });
  },
  settle(value) {
    const { resolve } = get();
    set({ open: false, options: null, resolve: null });
    resolve?.(value);
  },
}));

/** Promise 版确认框，替代 window.confirm */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}
