"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  Compass,
  FolderOpen,
  Frame,
  Github,
  LogOut,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Wand2,
  Wrench,
  type LucideIcon,
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

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  beta?: boolean;
};

/** All rail icons use Lucide — same stroke weight / size as admin & GitHub. */
const nav: NavItem[] = [
  { href: "/inspire", label: "灵感", Icon: Sparkles },
  { href: "/explore", label: "探索", Icon: Compass },
  { href: "/studio", label: "创作", Icon: Wand2 },
  { href: "/canvas", label: "画布", Icon: Frame, beta: true },
  { href: "/manju", label: "漫剧", Icon: Clapperboard, beta: true },
  { href: "/assets", label: "资产", Icon: FolderOpen },
  { href: "/tools", label: "工具", Icon: Wrench },
  { href: "/github", label: "GitHub", Icon: Github },
];

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
        className="mb-1 flex h-10 w-10 items-center justify-center"
        aria-label="JoyAI"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={JOYAI_BRAND.logo}
          alt="JoyAI"
          className="h-9 w-9 object-contain"
          draggable={false}
        />
      </Link>

      <nav className="mt-1 flex w-full flex-1 flex-col items-center gap-0.5 px-1">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.Icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex w-full flex-col items-center justify-center gap-0.5 py-1.5 outline-none transition-colors focus-visible:outline-none",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative inline-flex h-9 w-9 items-center justify-center">
                <Icon
                  className={cn(
                    "h-[var(--joy-icon-lg)] w-[var(--joy-icon-lg)] transition",
                    !active && "opacity-70",
                  )}
                  strokeWidth={1.75}
                />
                {item.beta ? (
                  <span className="absolute -bottom-1 -right-3 rounded-[6px] bg-[#7c5cff] px-1 py-[1px] text-[length:var(--joy-font-micro)] font-semibold leading-none text-white shadow-sm">
                    Beta
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate text-center text-[length:var(--joy-font-label)] font-medium leading-5 tracking-[-0.42px]">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex w-full flex-col items-center gap-2 px-1">
        {isAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "flex w-full flex-col items-center justify-center gap-0.5 py-1.5 outline-none transition-colors",
              adminActive
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="管理后台"
            title="管理后台"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center">
              <Shield
                className="h-[var(--joy-icon-lg)] w-[var(--joy-icon-lg)]"
                strokeWidth={1.75}
              />
            </span>
            <span className="max-w-full truncate text-center text-[length:var(--joy-font-label)] font-medium leading-5 tracking-[-0.42px]">
              管理
            </span>
          </Link>
        ) : null}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 px-1 py-1.5 text-[length:var(--joy-font-caption)] text-muted-foreground outline-none hover:text-foreground"
            >
              <Avatar className="h-9 w-9">
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
