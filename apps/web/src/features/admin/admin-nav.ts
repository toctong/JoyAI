import type { AdminTabSvgName } from "@/shared/ui/admin-tab-svg-icon";

export type AdminNavTab = {
  href: string;
  label: string;
  icon: AdminTabSvgName;
  end?: boolean;
};

export const ADMIN_NAV_TABS: AdminNavTab[] = [
  { href: "/admin", label: "概览", icon: "overview", end: true },
  { href: "/admin/jobs", label: "任务", icon: "jobs" },
  { href: "/admin/channels", label: "渠道", icon: "channels" },
  { href: "/admin/models", label: "模型", icon: "models" },
  { href: "/admin/skills", label: "技能", icon: "skills" },
  { href: "/admin/plugins", label: "插件", icon: "plugins" },
  { href: "/admin/users", label: "用户", icon: "users" },
  { href: "/admin/logs", label: "日志", icon: "logs" },
  { href: "/admin/settings", label: "设置", icon: "settings" },
];

export function isAdminNavActive(
  pathname: string,
  href: string,
  end?: boolean,
) {
  if (end || href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
