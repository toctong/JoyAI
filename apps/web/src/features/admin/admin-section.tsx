"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthHydrated, useAuthStore } from "@/shared/lib/auth-store";
import { JoyBootLoading } from "@/shared/ui/joy-boot-loading";
import { AdminGroupTabs } from "./admin-group-tabs";
import "./admin-section.css";

export function AdminSection({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthHydrated();

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace("/frame-rally");
      return;
    }
    if (user?.role !== "admin") {
      router.replace("/inspire");
    }
  }, [hydrated, token, user, router]);

  if (!hydrated) {
    return <JoyBootLoading fullScreen={false} label="加载中" />;
  }

  if (!token || user?.role !== "admin") {
    return <div className="h-full" />;
  }

  return (
    <div className="joy-admin">
      <div className="joy-admin-scroll">
        <div className="joy-admin-body">
          <div className="joy-admin-inner">
            <AdminGroupTabs />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
