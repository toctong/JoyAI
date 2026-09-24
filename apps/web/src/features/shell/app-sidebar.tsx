"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  Settings2,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useAuthStore } from "@/shared/lib/auth-store";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { TotpSecurityDialog } from "@/features/auth/totp-security-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { href: "/github", label: "GitHub", icon: "github" },
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
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const initial = (user?.username ?? "U").slice(0, 1).toUpperCase();
  const isAdmin = user?.role === "admin";
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
  const [totpOpen, setTotpOpen] = useState(false);

  return (
    <>
      <aside className="joy-sidebar sticky top-0 z-40 flex h-svh w-[var(--joy-sidebar-width)] shrink-0 flex-col items-center bg-card py-3">
        <Link
          href="/inspire"
          className="mb-1 flex size-10 items-center justify-center"
          aria-label="JoyAI"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={JOYAI_BRAND.logo}
            alt="JoyAI"
            className="size-9 object-contain"
            draggable={false}
          />
        </Link>

        <nav className="mt-2 flex min-h-0 w-full flex-1 flex-col items-center gap-[var(--joy-sidebar-item-gap)] overflow-y-auto px-0.5">
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

        <div className="mt-auto flex w-full shrink-0 flex-col items-center gap-2.5 px-0.5">
          {isAdmin ? (
            <RailLink
              href="/admin"
              label="管理"
              icon="admin"
              active={adminActive}
            />
          ) : null}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex flex-col items-center gap-1 px-1 py-1 text-[length:var(--joy-font-label)] font-medium leading-5 tracking-[-0.42px] text-[#7a7a7a] outline-none transition-colors hover:text-[#5c5c5c] dark:text-zinc-500 dark:hover:text-zinc-400"
              >
                <Avatar className="size-9">
                  <AvatarImage src={JOYAI_BRAND.remote.avatar} alt="" />
                  <AvatarFallback className="bg-muted text-[length:var(--joy-font-caption)] text-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-[64px] truncate">
                  {user?.username ?? "我"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-44">
              <DropdownMenuLabel className="truncate">
                {user?.username}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin ? (
                <DropdownMenuItem onClick={() => router.push("/admin")}>
                  <Shield className="h-4 w-4" />
                  管理后台
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => router.push("/account")}>
                <Settings2 className="h-4 w-4" />
                账户设置
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTotpOpen(true)}>
                <ShieldCheck className="h-4 w-4" />
                身份验证器
                {user?.totpEnabled ? (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    已开
                  </span>
                ) : null}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  router.replace("/login");
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
      <TotpSecurityDialog open={totpOpen} onOpenChange={setTotpOpen} />
    </>
  );
}
