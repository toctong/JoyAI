"use client";

import { cn } from "@/shared/lib/utils";

/** Admin header tab icons under `/public/icons/admin/*.svg`. */
export type AdminTabSvgName =
  | "overview"
  | "jobs"
  | "channels"
  | "models"
  | "plugins"
  | "users"
  | "logs"
  | "settings";

const ADMIN_ICON_REV = "admin-dual-3";

type Props = {
  name: AdminTabSvgName;
  active?: boolean;
  className?: string;
};

/** Dual-state tab icon (outline idle / filled active), same mask approach as rail. */
export function AdminTabSvgIcon({ name, active = false, className }: Props) {
  const file = active ? `${name}-active` : name;
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: `url(/icons/admin/${file}.svg?v=${ADMIN_ICON_REV})`,
        maskImage: `url(/icons/admin/${file}.svg?v=${ADMIN_ICON_REV})`,
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
