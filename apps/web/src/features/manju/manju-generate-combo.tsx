"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/** 主生成 pill，跟随系统 primary */
export function ManjuGenerateCombo({
  label,
  onPrimary,
  disabled = false,
  primaryDisabled = false,
  loading = false,
  emphasis = false,
  title,
  className,
}: {
  label: string;
  onPrimary: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  loading?: boolean;
  emphasis?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "manju-generate-combo",
        emphasis && "manju-generate-combo--emphasis",
        className,
      )}
      data-manju-focus="generate"
    >
      <button
        type="button"
        className="manju-generate-combo__primary"
        disabled={disabled || primaryDisabled || loading}
        title={title}
        onClick={onPrimary}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="manju-generate-combo__label">{label}</span>
      </button>
    </div>
  );
}
