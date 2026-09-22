"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSyncExternalStore } from "react";
import type { UserRole } from "@joyai/shared";

export type AuthUser = {
  id: string;
  username: string;
  role: UserRole;
  totpEnabled?: boolean;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "joyai-web-auth" },
  ),
);

/** True after zustand persist has rehydrated from localStorage. */
export function useAuthHydrated() {
  return useSyncExternalStore(
    (onStoreChange) => useAuthStore.persist.onFinishHydration(onStoreChange),
    () => useAuthStore.persist.hasHydrated(),
    () => false,
  );
}
