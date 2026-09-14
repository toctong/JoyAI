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
    // eslint-disable-next-line @next/next/no-img-element -- static /brand SVG/PNG
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn(
        "shrink-0 border border-border/60 bg-card object-contain p-px",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
      title={label}
      onError={() => setFailed(true)}
    />
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
