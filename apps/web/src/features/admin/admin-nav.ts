import type { AdminTabSvgName } from "@/shared/ui/admin-tab-svg-icon";

export type AdminNavChild = {
  href: string;
  label: string;
};

export type AdminNavTab = {
  href: string;
  label: string;
  icon: AdminTabSvgName;
  end?: boolean;
  /** Sibling pages shown as in-page tabs under this top nav item. */
  children?: AdminNavChild[];
};

/**
 * Top admin nav — keep short; related screens live under `children` as page tabs.
 *
 * 概览 · 任务 · 模型(模型/渠道) · 内容(提示词/风格/运镜/音色/技能/横幅) · 插件 · 系统(用户/日志/设置)
 */
export const ADMIN_NAV_TABS: AdminNavTab[] = [
  { href: "/admin", label: "概览", icon: "overview", end: true },
  { href: "/admin/jobs", label: "任务", icon: "jobs" },
  {
    href: "/admin/models",
    label: "模型",
    icon: "models",
    children: [
      { href: "/admin/models", label: "模型" },
      { href: "/admin/channels", label: "渠道" },
    ],
  },
  {
    href: "/admin/prompt-presets",
    label: "内容",
    icon: "skills",
    children: [
      { href: "/admin/prompt-presets", label: "提示词" },
      { href: "/admin/styles", label: "风格" },
      { href: "/admin/camera-moves", label: "运镜" },
      { href: "/admin/voices", label: "音色库" },
      { href: "/admin/skills", label: "技能" },
      { href: "/admin/inspire-banners", label: "横幅" },
    ],
  },
  { href: "/admin/plugins", label: "插件", icon: "plugins" },
  {
    href: "/admin/users",
    label: "系统",
    icon: "settings",
    children: [
      { href: "/admin/users", label: "用户" },
      { href: "/admin/logs", label: "日志" },
      { href: "/admin/settings", label: "设置" },
    ],
  },
];

export function isAdminNavActive(
  pathname: string,
  tab: AdminNavTab,
) {
  if (tab.end || tab.href === "/admin") return pathname === "/admin";
  if (tab.children?.length) {
    return tab.children.some(
      (child) =>
        pathname === child.href || pathname.startsWith(`${child.href}/`),
    );
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/** Find the nav group that owns the current path (for in-page tabs). */
export function findAdminNavGroup(pathname: string): AdminNavTab | null {
  for (const tab of ADMIN_NAV_TABS) {
    if (!tab.children?.length) continue;
    if (isAdminNavActive(pathname, tab)) return tab;
  }
  return null;
}
