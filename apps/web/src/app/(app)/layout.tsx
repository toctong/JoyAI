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
import { AppHeader } from "@/features/shell/app-header";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/shared/lib/utils";
import { JoyBootLoading } from "@/shared/ui/joy-boot-loading";

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
  /** Specialty tool detail owns full-height left/right split. */
  const isToolDetail = /^\/tools\/[^/]+$/.test(pathname);
  const isAdmin =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isInspireHome =
    pathname === "/inspire" || pathname.startsWith("/inspire/");
  /** Explore owns its scroll so sticky header + infinite load stay correct. */
  const isExplore =
    pathname === "/explore" || pathname.startsWith("/explore/");
  /** Studio owns scroll (chat feed sticks to bottom); avoid shell ScrollArea remount flash. */
  const isStudio = pathname === "/studio" || pathname.startsWith("/studio/");
  /** Canvas / manju list: sticky tabs+toolbar, grid scrolls inside. */
  const isWorkspaceList = pathname === "/canvas" || pathname === "/manju";
  const ownScroll =
    isCanvasEditor ||
    isManjuWorkbench ||
    isToolDetail ||
    isAdmin ||
    isInspireHome ||
    isExplore ||
    isStudio ||
    isWorkspaceList;

  useEffect(() => {
    if (hydrated && !token) router.replace("/frame-rally");
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
          current.role !== me.role ||
          Boolean(current.totpEnabled) !== Boolean(me.totpEnabled)
        ) {
          setAuth(token, {
            id: me.id,
            username: me.username,
            role: me.role,
            totpEnabled: Boolean(me.totpEnabled),
          });
        }
      } catch (error) {
        if (cancelled || isApiCancelError(error)) return;
        if (error instanceof ApiError && error.status === 401) {
          logout();
          router.replace("/frame-rally");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, token, setAuth, logout, router]);

  if (!hydrated) {
    return <JoyBootLoading label="正在进入" />;
  }

  if (!token) {
    return <div className="h-svh bg-background" />;
  }

  return (
    <div
      data-app-shell
      className="relative z-10 flex h-svh overflow-hidden bg-card"
    >
      {isCanvasEditor ? null : <AppSidebar />}
      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col",
          /*
           * Inspire hero bleeds under the rail. Do NOT use overflow-x:visible +
           * overflow-y:hidden — CSS coerces x back to auto and clips the bleed,
           * leaving a white padding strip on the left.
           */
          isInspireHome ? "overflow-visible" : "overflow-hidden",
        )}
      >
        <AppHeader
          overlay={isCanvasEditor || isManjuWorkbench || isToolDetail}
          hideCluster={isCanvasEditor || isManjuWorkbench}
        />
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1",
            isInspireHome ? "overflow-visible" : "overflow-hidden",
          )}
        >
          {ownScroll ? (
            children
          ) : (
            <ScrollArea className="h-full" type="hover">
              {children}
            </ScrollArea>
          )}
        </main>
      </div>
    </div>
  );
}
