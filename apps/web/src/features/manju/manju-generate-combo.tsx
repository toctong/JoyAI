"use client";

import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/** 青柠渐变主生成 + 右侧设定；定宽 148×38，对齐大片 header combo */
export function ManjuGenerateCombo({
  label,
  onPrimary,
  onOpenSettings,
  disabled = false,
  primaryDisabled = false,
  loading = false,
  className,
}: {
  label: string;
  onPrimary: () => void;
  onOpenSettings?: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("manju-generate-combo", className)}>
      <button
        type="button"
        className="manju-generate-combo__primary"
        disabled={disabled || primaryDisabled || loading}
        onClick={onPrimary}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="manju-generate-combo__label">{label}</span>
      </button>
      {onOpenSettings ? (
        <button
          type="button"
          className="manju-generate-combo__settings"
          aria-label="生成设置"
          disabled={disabled}
          onClick={onOpenSettings}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
