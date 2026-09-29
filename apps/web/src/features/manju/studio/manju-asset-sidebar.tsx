"use client";

import Link from "next/link";
import {
  BookOpen,
  Clapperboard,
  ChevronRight,
  MapPin,
  Package,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  UserRound,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ManjuProjectDraft } from "../manju-types";
import {
  manjuStudioHref,
  type ManjuStudioSection,
} from "./manju-studio-routes";

const NAV_ITEMS: {
  section: ManjuStudioSection;
  label: string;
  icon: typeof Settings2;
}[] = [
  { section: "settings", label: "初始设定", icon: Settings2 },
  { section: "source", label: "剧本信息", icon: BookOpen },
  { section: "characters", label: "角色资产", icon: UserRound },
  { section: "scenes", label: "场景资产", icon: MapPin },
  { section: "props", label: "道具资产", icon: Package },
  { section: "episode", label: "剧集管理", icon: Clapperboard },
];

type Props = {
  projectId: string;
  project: ManjuProjectDraft;
  collapsed: boolean;
  onToggleCollapse: () => void;
  section: ManjuStudioSection;
  activeEpId?: string | null;
};

export function ManjuAssetSidebar({
  projectId,
  project,
  collapsed,
  onToggleCollapse,
  section,
}: Props) {
  // 剧集管理永远进列表页；制作视频优先新标签（/episodes/[epId]），弹窗被拦则同页进入
  const episodesListHref = manjuStudioHref(projectId, "episode");

  return (
    <aside className="manju-asset-sidebar">
      <div className="manju-asset-sidebar__head">
        {!collapsed ? (
          <Link
            href={manjuStudioHref(projectId, "settings")}
            className="manju-asset-sidebar__project"
            title={project.title}
          >
            <span className="manju-asset-sidebar__project-name">
              {project.title || "未命名漫剧"}
            </span>
            <ChevronRight className="size-3.5 opacity-50" aria-hidden />
          </Link>
        ) : null}
        <button
          type="button"
          className="manju-asset-sidebar__collapse"
          onClick={onToggleCollapse}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        >
          {collapsed ? (
            <PanelLeft className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </button>
      </div>

      <ul className="manju-asset-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const href =
            item.section === "episode"
              ? episodesListHref
              : manjuStudioHref(projectId, item.section);
          const active =
            item.section === "episode"
              ? section === "episode"
              : section === item.section;
          return (
            <li key={item.section}>
              <Link
                href={href}
                className={cn(
                  "manju-asset-sidebar__link",
                  active && "is-active",
                )}
                title={item.label}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="manju-asset-sidebar__link-label">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
