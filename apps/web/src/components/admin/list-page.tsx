import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** Fill admin viewport: header/footer fixed, main scrolls internally. */
export function ListPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-4 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ListPageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 space-y-3", className)}>{children}</div>
  );
}

export function ListPageMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ListPageFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 pt-0.5", className)}>{children}</div>
  );
}

export function ListPageCard({
  children,
  className,
  scroll = true,
}: {
  children: ReactNode;
  className?: string;
  /** Internal scroll (default on). Set false for non-scrolling panels. */
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "joy-admin-panel",
        scroll && "joy-admin-panel-scroll",
        className,
      )}
    >
      {children}
    </div>
  );
}
