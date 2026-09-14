"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";

const STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  queued: {
    label: "排队中",
    className:
      "border-transparent bg-slate-500/12 text-slate-700 dark:text-slate-300",
  },
  running: {
    label: "运行中",
    className:
      "border-transparent bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
  polling: {
    label: "轮询中",
    className:
      "border-transparent bg-amber-500/12 text-amber-800 dark:text-amber-300",
  },
  succeeded: {
    label: "成功",
    className:
      "border-transparent bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    label: "失败",
    className:
      "border-transparent bg-destructive/12 text-destructive",
  },
  cancelled: {
    label: "已取消",
    className:
      "border-transparent bg-muted text-muted-foreground",
  },
};

export function JobStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? {
    label: status,
    className: "border-transparent bg-secondary text-secondary-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("rounded-md px-1.5 font-normal", meta.className, className)}
    >
      {meta.label}
    </Badge>
  );
}
