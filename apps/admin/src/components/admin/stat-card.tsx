import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
  loading,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "ok" | "warn" | "danger";
  loading?: boolean;
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";

  return (
    <Card className="overflow-hidden transition-[box-shadow,ring-color] duration-150 hover:shadow-sm hover:ring-1 hover:ring-foreground/15">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
            {title}
          </div>
          <div
            className={cn(
              "mt-0.5 truncate text-2xl font-semibold tabular-nums",
              toneClass,
            )}
          >
            {loading ? "…" : value}
          </div>
          {hint ? (
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {hint}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
