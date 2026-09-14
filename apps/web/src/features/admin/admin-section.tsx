"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  LayoutDashboard,
  LayoutGrid,
  Puzzle,
  Settings,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { MonitorActivity } from "@/components/icons/monitor-activity";
import { cn } from "@/shared/lib/utils";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import "./admin-section.css";

const tabs: {
  href: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}[] = [
  { href: "/admin", label: "概览", icon: LayoutDashboard, end: true },
  { href: "/admin/jobs", label: "任务", icon: MonitorActivity },
  { href: "/admin/channels", label: "渠道", icon: Waypoints },
  { href: "/admin/models", label: "模型", icon: LayoutGrid },
  { href: "/admin/plugins", label: "插件", icon: Puzzle },
  { href: "/admin/users", label: "用户", icon: Users },
  { href: "/admin/settings", label: "设置", icon: Settings },
];

function isActive(pathname: string, href: string, end?: boolean) {
  if (end || href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSection({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthHydrated();
  const onAdminRoute =
    pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/login");
      return;
    }
    if (user?.role !== "admin") {
      router.replace("/inspire");
    }
  }, [hydrated, token, user, router]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!token || user?.role !== "admin") {
    return <div className="h-full" />;
  }

  return (
    <div className="joy-admin">
      {onAdminRoute ? (
        <header className="joy-admin-header">
          <nav
            className="joy-admin-header-inner"
            role="tablist"
            aria-label="管理分区"
          >
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href, tab.end);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className={cn("joy-admin-tab", active && "is-active")}
                >
                  <span className="joy-admin-tab-icon-wrap">
                    <Icon className="joy-admin-tab-icon" aria-hidden />
                  </span>
                  <span className="joy-admin-tab-label">{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        </header>
      ) : null}

      <ScrollArea className="joy-admin-scroll" type="hover">
        <div className="joy-admin-body">
          <div className="joy-admin-inner">{children}</div>
        </div>
      </ScrollArea>
    </div>
  );
}
