"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bell,
  CheckCheck,
  LogOut,
  Settings2,
  Trash2,
} from "lucide-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NavSvgIcon } from "@/shared/ui/nav-svg-icon";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import {
  AdminTabSvgIcon,
} from "@/shared/ui/admin-tab-svg-icon";
import {
  ADMIN_NAV_TABS,
  isAdminNavActive,
} from "@/features/admin/admin-nav";
import {
  generationInboxUnreadCount,
  useGenerationInboxStore,
  type GenerationInboxItem,
} from "@/shared/lib/generation-inbox-store";
import "./app-header.css";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

function HeaderNotifyPanel() {
  const router = useRouter();
  const items = useGenerationInboxStore((s) => s.items);
  const markRead = useGenerationInboxStore((s) => s.markRead);
  const markAllRead = useGenerationInboxStore((s) => s.markAllRead);
  const remove = useGenerationInboxStore((s) => s.remove);
  const clear = useGenerationInboxStore((s) => s.clear);
  const unread = generationInboxUnreadCount(items);

  function openItem(item: GenerationInboxItem) {
    markRead(item.id);
    if (item.href) router.push(item.href);
  }

  return (
    <div className="joy-gen-inbox">
      <div className="joy-gen-inbox-head">
        <h2 className="joy-gen-inbox-title">生成通知</h2>
        <div className="joy-gen-inbox-actions">
          <button
            type="button"
            className="joy-gen-inbox-action"
            disabled={!unread}
            onClick={() => markAllRead()}
          >
            <span className="inline-flex items-center gap-1">
              <CheckCheck className="size-3.5" />
              全部已读
            </span>
          </button>
          <button
            type="button"
            className="joy-gen-inbox-action"
            disabled={!items.length}
            onClick={() => clear()}
            aria-label="清空通知"
            title="清空"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="joy-gen-inbox-list">
        {!items.length ? (
          <p className="joy-gen-inbox-empty">暂无生成通知</p>
        ) : (
          items.map((item) => {
            const thumbs = item.assets?.slice(0, 2) ?? [];
            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "joy-gen-inbox-item",
                  !item.read && "is-unread",
                )}
                onClick={() => openItem(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  remove(item.id);
                }}
              >
                <span className="joy-gen-inbox-dot" aria-hidden />
                <div className="joy-gen-inbox-copy">
                  <p className="joy-gen-inbox-item-title">{item.title}</p>
                  {item.lines[0] ? (
                    <p className="joy-gen-inbox-item-line">{item.lines[0]}</p>
                  ) : null}
                  <p className="joy-gen-inbox-item-time">
                    {dayjs(item.createdAt).fromNow()}
                  </p>
                </div>
                {thumbs.length ? (
                  <div className="joy-gen-inbox-thumbs">
                    {thumbs.map((asset) => {
                      const isVideo =
                        asset.kind === "video" ||
                        /\.(mp4|webm|mov)(\?|$)/i.test(asset.url);
                      return (
                        <div key={asset.id} className="joy-gen-inbox-thumb">
                          {isVideo ? (
                            <JoyVideoPoster
                              url={asset.url}
                              size="sm"
                              className="size-full object-cover"
                            />
                          ) : (
                            <JoyAssetThumb
                              url={asset.url}
                              size="sm"
                              className="size-full object-cover"
                              alt=""
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function AppHeader({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const initial = (user?.username ?? "U").slice(0, 1).toUpperCase();
  const isAdmin = user?.role === "admin";
  const adminActive = pathname === "/admin" || pathname.startsWith("/admin/");
  const githubActive =
    pathname === "/github" || pathname.startsWith("/github/");
  const [inboxOpen, setInboxOpen] = useState(false);

  const items = useGenerationInboxStore((s) => s.items);
  const unread = useMemo(
    () => generationInboxUnreadCount(items),
    [items],
  );
  const badge =
    unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

  return (
    <>
      <header
        className={cn(
          "joy-app-header",
          overlay && "is-overlay",
          adminActive && "has-admin-nav",
        )}
        data-app-header
      >
        {adminActive ? (
          <nav
            className="joy-app-header-admin-nav"
            role="tablist"
            aria-label="管理分区"
          >
            {ADMIN_NAV_TABS.map((tab) => {
              const active = isAdminNavActive(pathname, tab.href, tab.end);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  role="tab"
                  aria-selected={active}
                  className={cn(
                    "joy-app-header-admin-tab",
                    active && "is-active",
                  )}
                >
                  <AdminTabSvgIcon
                    name={tab.icon}
                    active={active}
                    className="size-[var(--joy-icon-sm)]"
                  />
                  <span>{tab.label}</span>
                </Link>
              );
            })}
          </nav>
        ) : (
          <div className="joy-app-header-spacer" aria-hidden />
        )}

        <div className="joy-app-header-cluster">
          <Link
            href="/github"
            className={cn(
              "joy-app-header-link",
              githubActive && "is-active",
            )}
            title="GitHub"
          >
            <NavSvgIcon
              name="github"
              active={githubActive}
              className="size-[var(--joy-icon-lg)]"
            />
            <span>GitHub</span>
          </Link>

          {isAdmin && !adminActive ? (
            <Link
              href="/admin"
              className="joy-app-header-link"
              title="管理"
            >
              <NavSvgIcon
                name="admin"
                className="size-[var(--joy-icon-lg)]"
              />
              <span>管理</span>
            </Link>
          ) : null}

          <Popover open={inboxOpen} onOpenChange={setInboxOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="joy-app-header-icon-btn"
                aria-label={
                  unread ? `生成通知，${unread} 条未读` : "生成通知"
                }
                title="生成通知"
              >
                <Bell className="size-[var(--joy-icon-md)]" strokeWidth={1.75} />
                {badge ? (
                  <span className="joy-app-header-badge">{badge}</span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-auto border p-0 shadow-lg"
            >
              <HeaderNotifyPanel />
            </PopoverContent>
          </Popover>

          <ThemeToggle className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="joy-app-header-user">
                <Avatar className="size-7">
                  <AvatarImage src={JOYAI_BRAND.remote.avatar} alt="" />
                  <AvatarFallback className="bg-muted text-[length:var(--joy-font-caption)] text-foreground">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="joy-app-header-user-name">
                  {user?.username ?? "我"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel className="truncate">
                {user?.username}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/account")}>
                <Settings2 className="h-4 w-4" />
                账户设置
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  router.replace("/frame-rally");
                }}
              >
                <LogOut className="h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
