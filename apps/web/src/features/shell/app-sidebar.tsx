"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { NavSvgIcon, type NavSvgName } from "@/shared/ui/nav-svg-icon";
import {
  isWorkspacePath,
  readWorkspaceMode,
  workspaceListHref,
  workspaceModeFromPath,
  writeWorkspaceMode,
} from "./workspace-nav";

type NavItem =
  | {
      kind: "link";
      href: string;
      label: string;
      icon: NavSvgName;
      beta?: boolean;
    }
  | {
      kind: "workspace";
      label: string;
      beta?: boolean;
    };

/** Product rail — SVG masks from `/public/icons/nav`. */
const nav: NavItem[] = [
  { kind: "link", href: "/inspire", label: "灵感", icon: "inspire" },
  { kind: "link", href: "/explore", label: "探索", icon: "explore" },
  { kind: "link", href: "/studio", label: "创作", icon: "studio" },
  { kind: "workspace", label: "项目", beta: true },
  { kind: "link", href: "/assets", label: "资产", icon: "assets" },
  { kind: "link", href: "/tools", label: "工具", icon: "tools" },
];

function RailLink({
  href,
  label,
  icon,
  active,
  beta,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavSvgName;
  active: boolean;
  beta?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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

function WorkspaceRailLink({
  pathname,
  label,
  beta,
}: {
  pathname: string;
  label: string;
  beta?: boolean;
}) {
  const fromPath = workspaceModeFromPath(pathname);
  const [href, setHref] = useState(workspaceListHref(fromPath ?? "canvas"));
  const active = isWorkspacePath(pathname);

  useEffect(() => {
    const mode = fromPath ?? readWorkspaceMode();
    if (fromPath) writeWorkspaceMode(fromPath);
    setHref(workspaceListHref(mode));
  }, [fromPath, pathname]);

  return (
    <RailLink
      href={href}
      label={label}
      icon="canvas"
      active={active}
      beta={beta}
      onNavigate={() => {
        const mode = fromPath ?? readWorkspaceMode();
        writeWorkspaceMode(mode);
      }}
    />
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="joy-sidebar sticky top-0 z-40 flex h-svh w-[var(--joy-sidebar-width)] shrink-0 flex-col items-center py-3">
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
          if (item.kind === "workspace") {
            return (
              <WorkspaceRailLink
                key="workspace"
                pathname={pathname}
                label={item.label}
                beta={item.beta}
              />
            );
          }
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
