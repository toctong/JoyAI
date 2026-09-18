"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
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
  const hydrated = useAuthHydrated();
  const isCanvasEditor = /^\/canvas\/[^/]+$/.test(pathname);
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
          {isCanvasEditor || isAdmin || isInspireHome || isExplore ? (
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
