"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/utils";

type BrandAvatarProps = {
  src?: string | null;
  label: string;
  size?: number;
  className?: string;
  /** Softer square for list rows */
  rounded?: "md" | "lg" | "full";
};

/**
 * Brand logos (often `fill=currentColor` SVGs) render black as <img>.
 * Keep a light tile behind them so they stay readable in dark mode.
 */
export function BrandAvatar({
  src,
  label,
  size = 32,
  className,
  rounded = "lg",
}: BrandAvatarProps) {
  const [failed, setFailed] = useState(false);
  const letter = (label.trim()[0] ?? "?").toUpperCase();
  const radius =
    rounded === "full"
      ? "rounded-full"
      : rounded === "md"
        ? "rounded-md"
        : "rounded-lg";

  if (!src || failed) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center border border-border/70 bg-secondary text-[11px] font-semibold text-muted-foreground",
          radius,
          className,
        )}
        style={{ width: size, height: size }}
        title={label}
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "joy-brand-avatar inline-flex shrink-0 items-center justify-center border border-black/8 bg-white p-px",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
      title={label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static /brand SVG/PNG */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("joy-brand-avatar-img h-full w-full object-contain", radius)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

/** Icon + text for selects / compact labels */
export function BrandLabel({
  src,
  label,
  size = 16,
  className,
}: {
  src?: string | null;
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <BrandAvatar src={src} label={label} size={size} rounded="md" />
      <span className="truncate">{label}</span>
    </span>
  );
}
