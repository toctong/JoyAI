import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
  href,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "ok" | "warn" | "danger";
  loading?: boolean;
  href?: string;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  const body = (
    <div className="flex items-start gap-3.5 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-secondary text-foreground">
        <Icon className="size-4 opacity-80" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          <span className="truncate">{title}</span>
          {href ? (
            <ChevronRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
          ) : null}
        </div>
        <div
          className={cn(
            "mt-1.5 truncate text-[30px] font-bold tabular-nums tracking-[-0.03em] leading-none",
            toneClass,
          )}
        >
          {loading ? (
            <span className="inline-block h-8 w-14 animate-pulse rounded-md bg-muted" />
          ) : (
            value
          )}
        </div>
        {hint ? (
          <div className="mt-2 truncate text-[12px] text-muted-foreground">
            {loading ? (
              <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" />
            ) : (
              hint
            )}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="joy-admin-panel group block transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="joy-admin-panel transition-colors hover:bg-secondary/40">
      {body}
    </div>
  );
}
