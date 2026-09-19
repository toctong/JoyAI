"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  useAuthHydrated,
  useAuthStore,
  type AuthUser,
} from "@/shared/lib/auth-store";
import { ApiError, api, isApiCancelError } from "@/shared/lib/api";
import { AppSidebar } from "@/features/shell/app-sidebar";
import {
  AppearanceTokens,
  WallpaperLayer,
} from "@/features/appearance";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/shared/lib/utils";

export default function AppShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const hydrated = useAuthHydrated();
  const isCanvasEditor = /^\/canvas\/[^/]+$/.test(pathname);
  /** 漫剧六步工作台自管全高布局（对照制作大片 / namistory） */
  const isManjuWorkbench = /^\/manju\/[^/]+$/.test(pathname);
  const isAdmin =
    pathname === "/admin" || pathname.startsWith("/admin/");
  /** Wallpaper plugin only paints the inspire home (updream-style). */
  const isInspireHome =
    pathname === "/inspire" || pathname.startsWith("/inspire/");
  /** Explore owns its scroll so sticky header + infinite load stay correct. */
  const isExplore =
    pathname === "/explore" || pathname.startsWith("/explore/");
  const wallpaperActive = isInspireHome && !isCanvasEditor;

  useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  /** Keep local user.id in sync: JWT identity is username, DB id may change. */
  useEffect(() => {
    if (!hydrated || !token) return;
    let cancelled = false;
    void (async () => {
      try {
        const me = await api<AuthUser & { createdAt?: string }>("/auth/me");
        if (cancelled) return;
        const current = useAuthStore.getState().user;
        if (
          !current ||
          current.id !== me.id ||
          current.username !== me.username ||
          current.role !== me.role
        ) {
          setAuth(token, {
            id: me.id,
            username: me.username,
            role: me.role,
          });
        }
      } catch (error) {
        if (cancelled || isApiCancelError(error)) return;
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace("/login");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, setAuth, logout, router]);

  if (!hydrated) {
    return (
      <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  if (!token) {
    return <div className="h-svh bg-background" />;
  }

  return (
    <>
      <AppearanceTokens disabled={!wallpaperActive} />
      <WallpaperLayer disabled={!wallpaperActive} />
      <div
        data-app-shell
        data-inspire-home={isInspireHome ? "" : undefined}
        className={cn(
          "relative z-10 flex h-svh overflow-hidden bg-card",
          /* Inspire is always dark chrome (sidebar + page), ignore global theme */
          isInspireHome && "dark",
        )}
      >
        <AppSidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {isCanvasEditor ||
          isManjuWorkbench ||
          isAdmin ||
          isInspireHome ||
          isExplore ? (
            children
          ) : (
            <ScrollArea className="h-full" type="hover">
              {children}
            </ScrollArea>
          )}
        </main>
      </div>
    </>
  );
}
