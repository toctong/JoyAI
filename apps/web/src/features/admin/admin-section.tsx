"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
import "./admin-section.css";

export function AdminSection({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthHydrated();

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
      <div className="joy-admin-scroll">
        <div className="joy-admin-body">
          <div className="joy-admin-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
