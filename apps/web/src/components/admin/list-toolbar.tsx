"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { LayoutGrid, List, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import type { AdminViewMode } from "@/shared/lib/use-admin-view-mode";

type ListToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  /** Only called on button click / Enter — never while typing. */
  onSearchSubmit?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  viewMode?: AdminViewMode;
  onViewModeChange?: (mode: AdminViewMode) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
  className?: string;
};

export function ListToolbar({
  search,
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = "搜索…",
  filters,
  viewMode,
  onViewModeChange,
  onRefresh,
  refreshing,
  actions,
  className,
}: ListToolbarProps) {
  const [draft, setDraft] = useState(search);

  useEffect(() => {
    setDraft(search);
  }, [search]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const value = draft.trim();
    onSearchChange(value);
    onSearchSubmit?.(value);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <form
          className="flex min-w-[220px] max-w-xl flex-1"
          onSubmit={submit}
        >
          <div className="joy-admin-toolbar-search">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={draft}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft(value);
                  onSearchChange(value);
                }}
                placeholder={searchPlaceholder}
                className="h-full rounded-none border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
              />
            </div>
            {onSearchSubmit ? (
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="h-full shrink-0 rounded-none border-l border-border/60 px-3.5 text-sm font-medium"
              >
                搜索
              </Button>
            ) : null}
          </div>
        </form>
        {filters}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-10 rounded-xl"
            disabled={refreshing}
            onClick={onRefresh}
            aria-label="刷新"
            title="刷新"
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
            />
          </Button>
        ) : null}

        {viewMode && onViewModeChange ? (
          <div className="joy-admin-view-toggle">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-xl",
                viewMode === "card" && "is-on",
              )}
              onClick={() => onViewModeChange("card")}
              aria-label="卡片视图"
              title="卡片视图"
            >
              <LayoutGrid className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-xl",
                viewMode === "list" && "is-on",
              )}
              onClick={() => onViewModeChange("list")}
              aria-label="列表视图"
              title="列表视图"
            >
              <List className="size-3.5" />
            </Button>
          </div>
        ) : null}

        {actions}
      </div>
    </div>
  );
}
