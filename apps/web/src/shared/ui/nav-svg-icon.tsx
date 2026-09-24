"use client";

import { cn } from "@/shared/lib/utils";

/** Left-rail product icons under `/public/icons/nav/*.svg`. */
export type NavSvgName =
  | "inspire"
  | "explore"
  | "studio"
  | "canvas"
  | "manju"
  | "assets"
  | "tools"
  | "github"
  | "admin";

const NAV_ICON_REV = "nav-dual-5";

type Props = {
  name: NavSvgName;
  /** Selected → filled glyph; default → outline (same pattern as joyai.com). */
  active?: boolean;
  className?: string;
  title?: string;
};

/**
 * Dual-state rail icon (idle outline / active fill), tinted via `bg-current`.
 * Mirrors joyai.com `icon` + `noActive` swap.
 */
export function NavSvgIcon({ name, active = false, className, title }: Props) {
  const file = active ? `${name}-active` : name;
  return (
    <span
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: `url(/icons/nav/${file}.svg?v=${NAV_ICON_REV})`,
        maskImage: `url(/icons/nav/${file}.svg?v=${NAV_ICON_REV})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
