"use client";

import type { ModelCapabilities, ModelPricing } from "@joyai/shared";
import {
  formatCapabilities,
  formatCapabilityDetails,
  formatModelPriceLines,
} from "@joyai/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/shared/lib/utils";

export function PriceSummary({
  pricing,
  className,
  /** Table cells: one line, extra tiers as +N */
  compact,
}: {
  pricing?: ModelPricing | null;
  className?: string;
  compact?: boolean;
}) {
  const lines = formatModelPriceLines(pricing ?? null);
  const tip = [lines.join("\n"), pricing?.note].filter(Boolean).join("\n");

  if (!lines.length) {
    return (
      <span className={cn("text-[12px] text-muted-foreground", className)}>
        —
      </span>
    );
  }

  if (compact) {
    const head = lines[0]!;
    const extra = lines.length - 1;
    return (
      <div
        className={cn(
          "max-w-[14rem] truncate font-mono text-[11px] tabular-nums text-muted-foreground",
          className,
        )}
        title={tip}
      >
        {head}
        {extra > 0 ? (
          <span className="text-muted-foreground/80"> · +{extra}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-[9.5rem] max-w-[16rem] flex-col gap-0.5 font-mono text-[11px] leading-snug tabular-nums text-muted-foreground",
        className,
      )}
      title={tip}
    >
      {lines.map((line) => (
        <span key={line} className="whitespace-nowrap">
          {line}
        </span>
      ))}
    </div>
  );
}

export function CapabilityBadges({
  capabilities,
  className,
  /** Table cells: single row, no wrap */
  compact,
}: {
  capabilities?: ModelCapabilities | null;
  className?: string;
  compact?: boolean;
}) {
  const details = formatCapabilityDetails(capabilities ?? null);
  const { features } = formatCapabilities(capabilities ?? null);
  const tip = [...details, features.length ? features.join(", ") : null]
    .filter(Boolean)
    .join("\n");

  if (!details.length && !features.length) {
    return (
      <span className={cn("text-[12px] text-muted-foreground", className)}>
        —
      </span>
    );
  }

  const [io, ...rest] = details;
  /** Long specs (分辨率/比例…) stay truncated — keep card body height stable. */
  const featureLimit = compact ? 3 : 5;
  const featureShown = features.slice(0, featureLimit);
  const chips = compact
    ? [...(io ? [io] : []), ...rest, ...featureShown]
    : [...(io ? [io] : []), ...featureShown];
  const metaLines = compact
    ? []
    : rest
        .filter((line) => /^(分辨率|尺寸|比例|参考|最长)/.test(line))
        .slice(0, 2);
  const limit = compact ? 4 : 6;
  const shown = chips.slice(0, limit);
  const hidden =
    chips.length -
    shown.length +
    Math.max(0, features.length - featureShown.length);

  return (
    <div
      className={cn(
        compact
          ? "flex max-w-[18rem] items-center gap-1 overflow-hidden"
          : "joy-admin-card-item-body flex min-w-0 flex-col gap-1",
        className,
      )}
      title={tip}
    >
      <div
        className={cn(
          "flex items-center gap-1",
          compact ? "flex-nowrap" : "min-h-6 flex-wrap content-start",
        )}
      >
        {shown.map((c) => (
          <Badge
            key={c}
            variant={c === io ? "outline" : "secondary"}
            className="shrink-0 rounded-md px-1.5 text-[10px] font-normal"
          >
            {c}
          </Badge>
        ))}
        {hidden > 0 ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            +{hidden}
          </span>
        ) : null}
      </div>
      {metaLines.map((line) => (
        <p
          key={line}
          className="truncate text-[11px] leading-4 text-muted-foreground"
        >
          {line}
        </p>
      ))}
    </div>
  );
}

export function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "llm") return "LLM";
  if (kind === "audio") return "音频";
  return kind;
}
