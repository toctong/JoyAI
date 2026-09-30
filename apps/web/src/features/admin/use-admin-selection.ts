"use client";

import { useCallback, useMemo, useState } from "react";

/** 管理端列表勾选（本页全选 / 跨页保留选中） */
export function useAdminSelection(pageIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedOnPage = useMemo(
    () => pageIds.filter((id) => selectedIds.includes(id)),
    [pageIds, selectedIds],
  );
  const allPageSelected =
    pageIds.length > 0 && selectedOnPage.length === pageIds.length;
  const somePageSelected =
    selectedOnPage.length > 0 && !allPageSelected;

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }, []);

  const togglePage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        if (checked) return [...new Set([...prev, ...pageIds])];
        return prev.filter((id) => !pageIds.includes(id));
      });
    },
    [pageIds],
  );

  const clear = useCallback(() => setSelectedIds([]), []);

  const removeId = useCallback((id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  return {
    selectedIds,
    setSelectedIds,
    selectedCount: selectedIds.length,
    allPageSelected,
    somePageSelected,
    toggle,
    togglePage,
    clear,
    removeId,
  };
}
