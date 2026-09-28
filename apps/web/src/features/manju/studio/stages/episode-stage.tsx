"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { StoryboardScriptStep } from "../../steps/storyboard-script-step";
import { PromptsStep } from "../../steps/prompts-step";
import { StoryboardVideoStep } from "../../steps/storyboard-video-step";
import { useManjuStore } from "../../manju-store";
import { ManjuWorkflowPanel } from "../episode/workflow-panel";
import { ScriptReviewGate } from "../episode/script-review-gate";
import { ShotSplitView } from "../episode/shot-split-view";

type EpisodeTab = "split" | "script" | "prompts" | "video";

export function EpisodeStage({
  projectId,
  episodeId,
}: {
  projectId: string;
  episodeId: string;
}) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const [tab, setTab] = useState<EpisodeTab>("split");

  if (!project) return null;

  const episode = project.episodes.find((e) => e.id === episodeId);
  const confirmed =
    project.scriptConfirmed || project.scriptReview?.status === "confirmed";

  return (
    <div className="manju-episode-stage">
      <ManjuWorkflowPanel
        projectId={projectId}
        className="manju-episode-stage__workflow"
      />

      <ScriptReviewGate projectId={projectId} />

      <div className="manju-episode-stage__title">
        {episode?.title ?? "分集"}
        {!confirmed ? (
          <span className="manju-episode-stage__hint">
            · 未确认脚本时视频 Tab 受限
          </span>
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as EpisodeTab)}
        className="manju-episode-stage__tabs"
      >
        <TabsList className="manju-episode-stage__tabs-list">
          <TabsTrigger value="split">镜头详情</TabsTrigger>
          <TabsTrigger value="script">分镜卡片</TabsTrigger>
          <TabsTrigger value="prompts" disabled={!confirmed}>
            提示词
          </TabsTrigger>
          <TabsTrigger value="video" disabled={!confirmed}>
            视频
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={cn("manju-episode-stage__body")}>
        {tab === "split" ? (
          <ShotSplitView
            project={project}
            episodeId={episodeId}
            locked={!confirmed}
          />
        ) : null}
        {tab === "script" ? (
          <StoryboardScriptStep project={project} episodeId={episodeId} />
        ) : null}
        {tab === "prompts" && confirmed ? (
          <PromptsStep project={project} episodeId={episodeId} />
        ) : null}
        {tab === "video" && confirmed ? (
          <StoryboardVideoStep project={project} episodeId={episodeId} />
        ) : null}
      </div>
    </div>
  );
}
