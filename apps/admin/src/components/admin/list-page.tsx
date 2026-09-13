import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** new-api 列表定高壳：占满主内容区 */
export function ListPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-1 flex-col gap-3", className)}>
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
  return <div className={cn("shrink-0 space-y-3", className)}>{children}</div>;
}

export function ListPageMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
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
  return <div className={cn("shrink-0 pt-1", className)}>{children}</div>;
}

/** 内容卡片：圆角 + 细边框 + 轻阴影 */
export function ListPageCard({
  children,
  className,
  scroll,
}: {
  children: ReactNode;
  className?: string;
  /** 表体内部滚动 */
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        scroll && "flex min-h-0 flex-1 flex-col",
        className,
      )}
    >
      {scroll ? (
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
