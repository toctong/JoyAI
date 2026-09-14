import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export function ListPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>{children}</div>
  );
}

export function ListPageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}

export function ListPageMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col", className)}>{children}</div>;
}

export function ListPageFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("pt-1", className)}>{children}</div>;
}

export function ListPageCard({
  children,
  className,
  scroll,
}: {
  children: ReactNode;
  className?: string;
  /** kept for call-site compatibility */
  scroll?: boolean;
}) {
  return (
    <div className={cn("joy-admin-panel", className)}>{children}</div>
  );
}
