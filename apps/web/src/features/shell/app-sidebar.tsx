"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  Compass,
  LogOut,
  Shield,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useAuthStore } from "@/shared/lib/auth-store";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
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
  icon?: string;
  Lucide?: LucideIcon;
  beta?: boolean;
};

const nav: NavItem[] = [
  {
    href: "/inspire",
    label: "灵感",
    icon: JOYAI_BRAND.nav.inspire,
  },
  {
    href: "/explore",
    label: "探索",
    Lucide: Compass,
  },
  {
    href: "/studio",
    label: "创作",
    icon: JOYAI_BRAND.nav.studio,
  },
  {
    href: "/tools",
    label: "工具",
    Lucide: Wrench,
  },
  {
    href: "/canvas",
    label: "画布",
    icon: JOYAI_BRAND.nav.canvas,
    beta: true,
  },
  {
    href: "/manju",
    label: "漫剧",
    Lucide: Clapperboard,
    beta: true,
  },
  {
    href: "/assets",
    label: "资产",
    icon: JOYAI_BRAND.nav.assets,
  },
];

function BrandImg({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} draggable={false} />
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

  return (
    <aside className="joy-sidebar sticky top-0 z-40 flex h-svh w-16 shrink-0 flex-col items-center bg-card py-3">
      <Link
        href="/inspire"
        className="mb-1 flex h-9 w-9 items-center justify-center"
        aria-label="JoyAI"
      >
        <BrandImg
          src={JOYAI_BRAND.logo}
          alt="JoyAI"
          className="h-8 w-8 object-contain"
        />
      </Link>

      <nav className="mt-1 flex w-full flex-1 flex-col items-center gap-0.5 px-1">
        {nav.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.Lucide;
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
              <span className="relative inline-flex h-8 w-8 items-center justify-center">
                {Icon ? (
                  <Icon
                    className={cn("h-5 w-5 transition", !active && "opacity-70")}
                  />
                ) : item.icon ? (
                  <BrandImg
                    src={item.icon}
                    alt=""
                    className={cn(
                      "h-7 w-7 object-contain transition",
                      !active && "opacity-70",
                      "dark:brightness-0 dark:invert",
                    )}
                  />
                ) : null}
                {item.beta ? (
                  <span className="absolute -bottom-1 -right-3 rounded-[6px] bg-[#7c5cff] px-1 py-[1px] text-[9px] font-semibold leading-none text-white shadow-sm">
                    Beta
                  </span>
                ) : null}
              </span>
              <span className="max-w-full truncate text-center text-[13px] font-medium leading-5 tracking-[-0.42px]">
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
            <span className="inline-flex h-8 w-8 items-center justify-center">
              <Shield className="h-5 w-5" />
            </span>
            <span className="max-w-full truncate text-center text-[13px] font-medium leading-5 tracking-[-0.42px]">
              管理
            </span>
          </Link>
        ) : null}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex flex-col items-center gap-1 px-1 py-1.5 text-[12px] text-muted-foreground outline-none hover:text-foreground"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={JOYAI_BRAND.remote.avatar} alt="" />
                <AvatarFallback className="bg-muted text-xs text-foreground">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <span className="max-w-[56px] truncate">
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
  );
}
