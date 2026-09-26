"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { findAdminNavGroup } from "./admin-nav";

/** In-page sibling tabs for a grouped admin section (模型 / 内容 / 系统). */
export function AdminGroupTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  const group = findAdminNavGroup(pathname);
  if (!group?.children?.length) return null;

  return (
    <nav
      className={cn("admin-group-tabs", className)}
      aria-label={`${group.label}分区`}
    >
      {group.children.map((child) => {
        const active =
          pathname === child.href || pathname.startsWith(`${child.href}/`);
        return (
          <Link
            key={child.href}
            href={child.href}
            className={cn("admin-group-tab", active && "is-active")}
          >
            {child.label}
          </Link>
        );
      })}
    </nav>
  );
}
