"use client";

import { useEffect, useState } from "react";

export type AdminViewMode = "card" | "list";

export function useAdminViewMode(
  storageKey: string,
  defaultMode: AdminViewMode = "card",
) {
  const [viewMode, setViewModeState] = useState<AdminViewMode>(defaultMode);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "card" || raw === "list") setViewModeState(raw);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  function setViewMode(mode: AdminViewMode) {
    setViewModeState(mode);
    try {
      localStorage.setItem(storageKey, mode);
    } catch {
      /* ignore */
    }
  }

  return { viewMode: hydrated ? viewMode : defaultMode, setViewMode };
}
