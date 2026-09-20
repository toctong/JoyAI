"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ManjuProjectDraft } from "./manju-types";

/** 分镜步内容区：分镜/提示词切换 + 紧凑分集筛选 */
export function ManjuStoryboardViewBar({
  project,
  episodeId,
  view,
  onSelectView,
  onSelectEpisode,
}: {
  project: ManjuProjectDraft;
  episodeId: string | null;
  /** 仅分镜脚本步传 shots/prompts；视频/预览不传 */
  view?: "shots" | "prompts";
  onSelectView?: (view: "shots" | "prompts") => void;
  onSelectEpisode: (episodeId: string | null) => void;
}) {
  const showViewTabs = Boolean(view && onSelectView);
  const showEpisodes = project.episodes.length > 0;
  if (!showViewTabs && !showEpisodes) return null;

  const epValue = episodeId ?? "all";

  return (
    <div className="manju-storyboard-view-bar">
      {showViewTabs ? (
        <Tabs
          value={view}
          onValueChange={(v) => onSelectView?.(v as "shots" | "prompts")}
        >
          <TabsList className="manju-script-meta__tabs">
            <TabsTrigger value="shots">分镜</TabsTrigger>
            <TabsTrigger value="prompts">提示词</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {showEpisodes ? (
        <div className="manju-storyboard-view-bar__ep-select">
          <span className="manju-storyboard-view-bar__ep-label">分集</span>
          <Select
            value={epValue}
            onValueChange={(v) =>
              onSelectEpisode(v === "all" ? null : v)
            }
          >
            <SelectTrigger
              className="manju-storyboard-view-bar__ep-trigger"
              aria-label="选择分集"
            >
              <SelectValue placeholder="全部镜头" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">全部镜头</SelectItem>
              {project.episodes.map((ep, i) => (
                <SelectItem key={ep.id} value={ep.id}>
                  {String(i + 1).padStart(2, "0")} {ep.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
