"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Monitor, ShieldCheck } from "lucide-react";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { useAuthStore } from "@/shared/lib/auth-store";
import { VIEW_PREF_COOKIE } from "@/shared/lib/device";

export default function MobileAccountPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="joy-m-page">
      <div className="joy-m-account-profile">
        <span className="joy-m-account-avatar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={JOYAI_BRAND.avatar} alt="" draggable={false} />
        </span>
        <div className="joy-m-account-meta">
          <h2 className="joy-m-page-title" style={{ marginBottom: 4 }}>
            {user?.username || "未登录"}
          </h2>
          <p className="joy-m-page-desc" style={{ marginBottom: 0 }}>
            {user?.role === "admin" ? "管理员" : "创作者"}
          </p>
        </div>
      </div>

      <div className="joy-m-card">
        <p className="joy-m-card-title">电脑版</p>
        <p className="joy-m-card-text">完整创作台、画布与管理后台请使用电脑版。</p>
        <button
          type="button"
          className="joy-m-desktop-link"
          style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => {
            document.cookie = `${VIEW_PREF_COOKIE}=desktop; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
            window.location.assign("/inspire");
          }}
        >
          <Monitor className="size-3.5" />
          切换到电脑版
        </button>
      </div>

      {user?.role === "admin" ? (
        <div className="joy-m-card">
          <p className="joy-m-card-title">管理后台</p>
          <p className="joy-m-card-text">管理端仅在电脑版提供。</p>
          <Link
            href="/admin"
            className="joy-m-desktop-link"
            style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => {
              document.cookie = `${VIEW_PREF_COOKIE}=desktop; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
            }}
          >
            <ShieldCheck className="size-3.5" />
            打开管理（电脑版）
          </Link>
        </div>
      ) : null}

      <div className="joy-m-card">
        <button
          type="button"
          className="joy-m-desktop-link"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={() => {
            logout();
            router.replace("/frame-rally");
          }}
        >
          <LogOut className="size-3.5" />
          退出登录
        </button>
      </div>
    </div>
  );
}
