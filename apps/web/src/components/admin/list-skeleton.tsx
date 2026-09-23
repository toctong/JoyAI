"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";

/** Table-shaped loading placeholder for admin list pages. */
export function AdminListSkeleton({
  rows = 8,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3 p-4", className)} aria-busy aria-label="加载中">
      <div className="flex gap-3 border-b border-border/60 pb-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3.5 flex-1 rounded-md" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={`r-${row}`} className="flex items-center gap-3 py-1">
          {Array.from({ length: cols }).map((_, col) => (
            <Skeleton
              key={`c-${row}-${col}`}
              className={cn(
                "h-4 flex-1 rounded-md",
                col === 0 && "max-w-[120px]",
                col === cols - 1 && "max-w-[72px]",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
