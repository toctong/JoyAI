"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ConfigProvider } from "antd-mobile";
import zhCN from "antd-mobile/es/locales/zh-CN";
import { Monitor } from "lucide-react";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import {
  useAuthHydrated,
  useAuthStore,
} from "@/shared/lib/auth-store";
import { VIEW_PREF_COOKIE, toDesktopPath } from "@/shared/lib/device";
import { JoyBootLoading } from "@/shared/ui/joy-boot-loading";
import { MobileTabbar } from "./mobile-tabbar";
import "antd-mobile/es/global";
import "./mobile.css";

const TITLES: Record<string, string> = {
  "/m/inspire": "灵感",
  "/m/explore": "探索",
  "/m/studio": "创作",
  "/m/assets": "资产",
  "/m/tools": "工具",
  "/m/account": "账户",
  "/m/canvas": "画布",
  "/m/manju": "漫剧",
};

/** Pages that own their own hero title — hide chrome title. */
const HERO_TITLE_PATHS = new Set(["/m/explore", "/m/inspire"]);

function titleForPath(pathname: string) {
  if (TITLES[pathname]) return TITLES[pathname];
  for (const [prefix, title] of Object.entries(TITLES)) {
    if (pathname.startsWith(`${prefix}/`)) return title;
  }
  return "FrameRally";
}

function hideChromeTitleFor(pathname: string) {
  if (HERO_TITLE_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/m/tools/")) return true;
  return false;
}

function hideTabbarFor(pathname: string) {
  return pathname.startsWith("/m/tools/") && pathname !== "/m/tools";
}

function switchToDesktop(pathname: string) {
  document.cookie = `${VIEW_PREF_COOKIE}=desktop; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  window.location.assign(toDesktopPath(pathname));
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthHydrated();
  const title = titleForPath(pathname);
  const hideChromeTitle = hideChromeTitleFor(pathname);
  const hideTabbar = hideTabbarFor(pathname);

  useEffect(() => {
    if (hydrated && !token) router.replace("/frame-rally");
  }, [hydrated, token, router]);

  if (!hydrated) {
    return <JoyBootLoading label="正在进入" />;
  }

  if (!token) {
    return <div className="joy-m" />;
  }

  return (
    <ConfigProvider locale={zhCN}>
      <div className="joy-m" data-mobile-shell>
        <div className="joy-m-atmosphere" aria-hidden />
        <header className="joy-m-top">
          <Link href="/m/inspire" className="joy-m-brand" aria-label="FrameRally">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOYAI_BRAND.logo}
              alt=""
              className="joy-m-brand-mark"
              draggable={false}
            />
            <span className="joy-m-brand-name">FrameRally</span>
          </Link>
          {!hideChromeTitle ? (
            <h1 className="joy-m-top-title">{title}</h1>
          ) : (
            <div className="joy-m-top-spacer" />
          )}
          <div className="joy-m-top-actions">
            <button
              type="button"
              className="joy-m-icon-btn"
              aria-label="电脑版"
              title="电脑版"
              onClick={() => switchToDesktop(pathname)}
            >
              <Monitor className="size-4" strokeWidth={1.75} />
            </button>
            <Link
              href="/m/account"
              className="joy-m-icon-btn joy-m-icon-btn-avatar"
              aria-label="账户"
              title="账户"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={JOYAI_BRAND.avatar} alt="" draggable={false} />
            </Link>
          </div>
        </header>
        <main className={hideTabbar ? "joy-m-body is-solo" : "joy-m-body"}>
          {children}
        </main>
        {hideTabbar ? null : <MobileTabbar />}
      </div>
    </ConfigProvider>
  );
}
