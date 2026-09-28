"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Clapperboard,
  LayoutDashboard,
  MapPin,
  Package,
  PanelLeft,
  PanelLeftClose,
  Settings2,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import type { ManjuProjectDraft } from "../manju-types";
import {
  manjuStudioHref,
  type ManjuStudioSection,
} from "./manju-studio-routes";

const NAV_ITEMS: {
  section: ManjuStudioSection;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { section: "overview", label: "概览", icon: LayoutDashboard },
  { section: "source", label: "剧本", icon: BookOpen },
  { section: "characters", label: "角色", icon: UserRound },
  { section: "scenes", label: "场景", icon: MapPin },
  { section: "props", label: "道具", icon: Package },
  { section: "settings", label: "设定", icon: Settings2 },
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
  activeEpId = null,
}: Props) {
  const [query, setQuery] = useState("");

  const episodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return project.episodes;
    return project.episodes.filter(
      (ep) =>
        ep.title.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q),
    );
  }, [project.episodes, query]);

  const shotProgress = useMemo(() => {
    const map = new Map<
      string,
      { hasStoryboard: boolean; hasVideo: boolean }
    >();
    for (const ep of project.episodes) {
      const shots = project.shots.filter((s) => s.episodeId === ep.id);
      map.set(ep.id, {
        hasStoryboard: shots.some((s) => Boolean(s.storyboardImageUrl)),
        hasVideo: shots.some((s) => Boolean(s.videoUrl)),
      });
    }
    return map;
  }, [project.episodes, project.shots]);

  return (
    <aside className="manju-asset-sidebar">
      <div className="manju-asset-sidebar__head">
        {!collapsed ? (
          <span className="text-sm text-muted-foreground">资产导航</span>
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
          const href = manjuStudioHref(projectId, item.section);
          const active = section === item.section;
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

      <div className="manju-asset-sidebar__section">
        <p className="manju-asset-sidebar__section-title">分集</p>
        {!collapsed ? (
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索分集…"
            className="manju-asset-sidebar__search h-8"
          />
        ) : null}
        {episodes.length === 0 ? (
          <p className="manju-asset-sidebar__empty">
            {collapsed ? "—" : "暂无分集"}
          </p>
        ) : (
          <ul className="manju-asset-sidebar__episodes">
            {episodes.map((ep, index) => {
              const href = manjuStudioHref(projectId, "episode", {
                epId: ep.id,
              });
              const active =
                section === "episode" && activeEpId === ep.id;
              const progress = shotProgress.get(ep.id);
              return (
                <li key={ep.id}>
                  <Link
                    href={href}
                    className={cn(
                      "manju-asset-sidebar__ep",
                      active && "is-active",
                    )}
                    title={ep.title || `第${index + 1}集`}
                  >
                    {collapsed ? (
                      <Clapperboard className="size-4 mx-auto" aria-hidden />
                    ) : (
                      <>
                        <span className="manju-asset-sidebar__ep-title">
                          {ep.title || `第${index + 1}集`}
                        </span>
                        <span className="manju-asset-sidebar__ep-meta">
                          <span
                            className={cn(
                              "manju-asset-sidebar__dot",
                              progress?.hasStoryboard && "is-on",
                            )}
                            title="分镜"
                          />
                          <span
                            className={cn(
                              "manju-asset-sidebar__dot",
                              progress?.hasVideo && "is-on",
                            )}
                            title="视频"
                          />
                        </span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
