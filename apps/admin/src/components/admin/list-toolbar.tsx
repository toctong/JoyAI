"use client";

import type { ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";

type Props = {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
  className?: string;
};

/** new-api DataTableToolbar：左搜索/筛选，右刷新/主操作 */
export function ListToolbar({
  search = "",
  onSearchChange,
  searchPlaceholder = "搜索…",
  filters,
  onRefresh,
  refreshing,
  actions,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {onSearchChange ? (
          <div className="relative min-w-[180px] max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8"
            />
          </div>
        ) : null}
        {filters}
      </div>
      <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5">
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
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
        {actions}
      </div>
    </div>
  );
}
