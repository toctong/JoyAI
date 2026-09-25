"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { NavSvgIcon, type NavSvgName } from "@/shared/ui/nav-svg-icon";

type NavItem = {
  href: string;
  label: string;
  icon: NavSvgName;
  beta?: boolean;
};

/** Product rail — SVG masks from `/public/icons/nav`. */
const nav: NavItem[] = [
  { href: "/inspire", label: "灵感", icon: "inspire" },
  { href: "/explore", label: "探索", icon: "explore" },
  { href: "/studio", label: "创作", icon: "studio" },
  { href: "/canvas", label: "画布", icon: "canvas", beta: true },
  { href: "/manju", label: "漫剧", icon: "manju", beta: true },
  { href: "/assets", label: "资产", icon: "assets" },
  { href: "/tools", label: "工具", icon: "tools" },
];

function RailLink({
  href,
  label,
  icon,
  active,
  beta,
}: {
  href: string;
  label: string;
  icon: NavSvgName;
  active: boolean;
  beta?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "joy-rail-link group relative flex w-full flex-col items-center justify-center gap-1 outline-none focus-visible:outline-none",
        active && "is-active",
      )}
    >
      <span className="relative inline-flex size-[var(--joy-sidebar-icon)] items-center justify-center">
        <NavSvgIcon
          name={icon}
          active={active}
          className="size-[var(--joy-sidebar-icon)]"
        />
        {beta ? (
          <span className="pointer-events-none absolute -right-2 -top-1 rounded-[4px] bg-[#7c5cff] px-[3px] py-px text-[9px] font-semibold leading-none tracking-tight text-white">
            Beta
          </span>
        ) : null}
      </span>
      <span className="max-w-full truncate text-center text-[length:var(--joy-font-label)] font-medium leading-5 tracking-[-0.42px]">
        {label}
      </span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="joy-sidebar sticky top-0 z-40 flex h-svh w-[var(--joy-sidebar-width)] shrink-0 flex-col items-center bg-card py-3">
      <Link
        href="/inspire"
        className="mb-1 flex size-10 items-center justify-center"
        aria-label="FrameRally"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOYAI_BRAND.logo}
          alt="FrameRally"
          className="size-9 object-contain"
          draggable={false}
        />
      </Link>

      <nav className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-[var(--joy-sidebar-item-gap)] overflow-y-auto px-0.5 pb-2">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <RailLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={active}
              beta={item.beta}
            />
          );
        })}
      </nav>
    </aside>
  );
}
