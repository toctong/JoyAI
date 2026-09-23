"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Wrench, type LucideIcon } from "lucide-react";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";

type Tab =
  | {
      href: string;
      label: string;
      primary?: false;
      img?: string;
      Icon?: LucideIcon;
    }
  | {
      href: string;
      label: string;
      primary: true;
      img: string;
    };

const tabs: Tab[] = [
  { href: "/m/inspire", label: "灵感", img: JOYAI_BRAND.nav.inspire },
  { href: "/m/explore", label: "探索", Icon: Compass },
  { href: "/m/studio", label: "创作", primary: true, img: JOYAI_BRAND.nav.studio },
  { href: "/m/assets", label: "资产", img: JOYAI_BRAND.nav.assets },
  { href: "/m/tools", label: "工具", Icon: Wrench },
];

export function MobileTabbar() {
  const pathname = usePathname();

  return (
    <nav className="joy-m-tabbar" aria-label="移动主导航">
      <svg
        className="joy-m-tabbar-curve"
        viewBox="0 0 390 28"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          className="joy-m-tabbar-curve-fill"
          d="M0 28 V14 H146 C154 14 160 14 166 10 C180 -2 210 -2 224 10 C230 14 236 14 244 14 H390 V28 Z"
        />
        <path
          className="joy-m-tabbar-curve-stroke"
          d="M0 14 H146 C154 14 160 14 166 10 C180 -2 210 -2 224 10 C230 14 236 14 244 14 H390"
          fill="none"
        />
      </svg>

      <div className="joy-m-tabbar-inner">
        {tabs.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          if (tab.primary) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "joy-m-tab joy-m-tab-primary",
                  active && "is-active",
                )}
                aria-current={active ? "page" : undefined}
                aria-label={tab.label}
              >
                <span className="joy-m-tab-primary-btn">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tab.img}
                    alt=""
                    className="joy-m-tab-primary-img"
                    draggable={false}
                  />
                </span>
                <span className="joy-m-tab-label">{tab.label}</span>
                <span className="joy-m-tab-indicator" aria-hidden />
              </Link>
            );
          }

          const Icon = tab.Icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn("joy-m-tab", active && "is-active")}
              aria-current={active ? "page" : undefined}
            >
              <span className="joy-m-tab-ico-wrap">
                {tab.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tab.img}
                    alt=""
                    className={cn("joy-m-tab-img", active && "is-active")}
                    draggable={false}
                  />
                ) : Icon ? (
                  <Icon
                    className="joy-m-tab-icon"
                    strokeWidth={active ? 2.1 : 1.65}
                  />
                ) : null}
              </span>
              <span className="joy-m-tab-label">{tab.label}</span>
              <span className="joy-m-tab-indicator" aria-hidden />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
