"use client";

import { cn } from "@/shared/lib/utils";
import "./manju-text-field.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Min height in px */
  minHeight?: number;
  className?: string;
  readOnly?: boolean;
  /** Larger type / line-height for script body */
  variant?: "default" | "script";
  rows?: number;
  id?: string;
};

/** Light plain-text field for manju (no MD toolbar). */
export function ManjuTextField({
  value,
  onChange,
  placeholder,
  minHeight = 120,
  className,
  readOnly = false,
  variant = "default",
  rows,
  id,
}: Props) {
  return (
    <textarea
      id={id}
      className={cn(
        "manju-text-field",
        variant === "script" && "manju-text-field--script",
        className,
      )}
      style={{ minHeight }}
      value={value}
      rows={rows}
      readOnly={readOnly}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}
