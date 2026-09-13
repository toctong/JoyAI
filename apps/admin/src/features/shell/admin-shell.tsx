"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Boxes,
  Briefcase,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Users,
  Waypoints,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "@/components/command/command-palette";

const SIDEBAR_KEY = "joyai_admin_sidebar_collapsed";

const navGroups = [
  {
    id: "ops",
    label: "运营",
    items: [
      { href: "/", label: "概览", icon: LayoutDashboard, end: true },
      { href: "/jobs", label: "任务", icon: Briefcase },
    ],
  },
  {
    id: "ai",
    label: "AI 配置",
    items: [
      { href: "/channels", label: "渠道", icon: Waypoints },
      { href: "/models", label: "模型", icon: Boxes },
    ],
  },
  {
    id: "system",
    label: "系统",
    items: [
      { href: "/users", label: "用户", icon: Users },
      { href: "/settings", label: "设置", icon: Settings },
    ],
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const hydrated = useAuthHydrated();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || user?.role !== "admin") {
      logout();
      router.replace("/login");
    }
  }, [hydrated, token, user, logout, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!token || user?.role !== "admin") {
    return <div className="min-h-svh bg-background" />;
  }

  const initial = user.username.slice(0, 1).toUpperCase();

  function isActive(href: string, end?: boolean) {
    if (end || href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex h-[var(--app-header-height)] shrink-0 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "gap-2",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/mirora-mark.png"
          alt=""
          className="size-7 object-contain"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        {!collapsed ? (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">
              JoyAI Admin
            </div>
            <div className="truncate text-[10px] text-sidebar-foreground/60">
              NewAPI 风格控制台
            </div>
          </div>
        ) : null}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <div className="space-y-3">
          {navGroups.map((group) => (
            <div key={group.id}>
              {!collapsed ? (
                <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/50">
                  {group.label}
                </div>
              ) : (
                <div className="mx-auto mb-1 h-px w-5 bg-sidebar-border" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href, item.end);
                  const Icon = item.icon;
                  const link = (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg text-sm transition-colors",
                        collapsed
                          ? "size-9 justify-center p-0"
                          : "px-2.5 py-2",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed ? (
                        <span className="truncate">{item.label}</span>
                      ) : null}
                    </Link>
                  );
                  if (!collapsed) return link;
                  return (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="z-40 flex h-[var(--app-header-height)] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="打开菜单"
          onClick={() => setMobileOpen(true)}
        >
          <PanelLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>

        <div className="flex-1" />

        <kbd className="pointer-events-none hidden h-7 select-none items-center gap-1 rounded-md border border-border bg-muted px-2 font-mono text-[10px] text-muted-foreground sm:inline-flex">
          <span className="text-xs">Ctrl</span>K
        </kbd>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/15 text-xs text-primary">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[120px] truncate text-sm sm:inline">
                {user.username}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel>管理员</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                router.replace("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "hidden h-full shrink-0 border-r border-sidebar-border transition-[width] duration-200 md:block",
            collapsed ? "w-[64px]" : "w-[220px]",
          )}
        >
          {sidebar}
        </aside>

        {mobileOpen ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="关闭菜单"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[240px] border-r border-sidebar-border bg-sidebar shadow-xl">
              {sidebar}
            </aside>
          </div>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-5">
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
