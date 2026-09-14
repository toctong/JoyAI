import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function AdminEmptyState({
  title = "暂无数据",
  description,
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("joy-admin-empty", className)}>
      <p className="joy-admin-empty-title">{title}</p>
      {description ? (
        <p className="joy-admin-empty-desc">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
