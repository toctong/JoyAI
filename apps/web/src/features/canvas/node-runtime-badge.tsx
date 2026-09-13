"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { isBusyStatus, isFailedStatus } from "./node-registry";

type Props = {
  status: string;
  error?: string;
  onRetry?: () => void;
  /** overlay = bottom of media card; inline = flow in prompt card */
  variant?: "overlay" | "inline";
  className?: string;
};

export function NodeRuntimeBadge({
  status,
  error,
  onRetry,
  variant = "overlay",
  className,
}: Props) {
  if (isBusyStatus(status)) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 bg-black/65 px-2 py-1 text-[11px] text-white/90",
          variant === "overlay" &&
            "pointer-events-none absolute inset-x-0 bottom-0 z-[1]",
          variant === "inline" && "mt-2 rounded-md",
          className,
        )}
      >
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        <span>{status === "queued" ? "排队中…" : "生成中…"}</span>
      </div>
    );
  }

  if (isFailedStatus(status)) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 bg-red-950/85 px-2 py-1 text-[11px] text-red-100",
          variant === "overlay" && "absolute inset-x-0 bottom-0 z-[1]",
          variant === "inline" && "mt-2 rounded-md",
          className,
        )}
        title={error || "生成失败"}
      >
        <AlertCircle className="h-3 w-3 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{error || "生成失败"}</span>
        {onRetry ? (
          <button
            type="button"
            className="pointer-events-auto inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-red-50 hover:bg-white/10"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRetry();
            }}
          >
            <RotateCcw className="h-3 w-3" />
            重试
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
