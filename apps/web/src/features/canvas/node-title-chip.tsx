"use client";

import { cn } from "@/shared/lib/utils";

/** Floating title chip above a node (hover / selected). */
export function NodeTitleChip({
  label,
  visible,
  className,
}: {
  label: string;
  visible: boolean;
  className?: string;
}) {
  if (!visible || !label) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute left-0 top-0 z-[3] max-w-full -translate-y-[calc(100%+6px)] truncate rounded-md bg-popover/95 px-2 py-0.5 text-[11px] font-medium text-popover-foreground shadow-sm ring-1 ring-border",
        className,
      )}
      title={label}
    >
      {label}
    </div>
  );
}
