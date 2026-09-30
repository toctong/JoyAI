"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { useManjuStore } from "../../manju-store";
import { draftFromProject } from "../../manju-api";
import { manjuStudioHref } from "../manju-studio-routes";
import type { ManjuProjectDraft } from "../../manju-types";
import { ManjuReviewButton } from "../manju-review-button";
import { submitWorkflowSkill } from "../../lib/workflow-skill";

export function OverviewStage({ projectId }: { projectId: string }) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);
  const flushSave = useManjuStore((s) => s.flushSave);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[projectId]));

  const gridShots = useMemo(() => {
    if (!project) return [];
    return project.shots
      .filter((s) => s.gridGroupId && s.storyboardImageUrl)
      .slice(0, 9);
  }, [project]);

  if (!project) return null;

  const characterCount = project.assets.filter(
    (a) => a.kind === "character",
  ).length;
  const sceneCount = project.assets.filter((a) => a.kind === "scene").length;
  const propCount = project.assets.filter((a) => a.kind === "prop").length;
  const episodeCount = project.episodes.length;
  const shotCount = project.shots.length;
  const videoCount = project.shots.filter((s) => s.videoUrl).length;
  const snapshots = project.draftSnapshots ?? [];

  const cards = [
    {
      href: manjuStudioHref(projectId, "source"),
      label: "剧本",
      value: project.scriptText.trim() ? "已录入" : "待开始",
      hint: project.scriptConfirmed ? "脚本已确认" : "尚未确认脚本",
    },
    {
      href: manjuStudioHref(projectId, "characters"),
      label: "角色 / 场景 / 道具",
      value: `${characterCount} / ${sceneCount} / ${propCount}`,
      hint: "资产库",
    },
    {
      href: manjuStudioHref(projectId, "episode"),
      label: "分集",
      value: String(episodeCount),
      hint: `${shotCount} 个镜头`,
    },
    {
      href: manjuStudioHref(projectId, "preview"),
      label: "成片预览",
      value: String(videoCount),
      hint: videoCount > 0 ? "已有视频镜头" : "暂无成片",
    },
  ];

  const saveSnapshot = async () => {
    const label = `快照 ${new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const next = [
      {
        id: crypto.randomUUID(),
        label,
        createdAt: new Date().toISOString(),
        draft: draftFromProject(project),
      },
      ...snapshots,
    ].slice(0, 12);
    updateProject(projectId, { draftSnapshots: next });
    await flushSave(projectId);
    toast.success("已保存草稿快照");
  };

  const restoreSnapshot = async (snap: NonNullable<
    ManjuProjectDraft["draftSnapshots"]
  >[number]) => {
    const ok = await confirmDialog({
      title: "恢复此快照？",
      description: `将用「${snap.label}」覆盖当前草稿（媒体 URL 会一并恢复）。建议先另存一份快照。`,
      confirmText: "恢复",
      cancelText: "取消",
    });
    if (!ok) return;
    const d = snap.draft as Partial<ManjuProjectDraft> & Record<string, unknown>;
    updateProject(projectId, {
      scriptText: typeof d.scriptText === "string" ? d.scriptText : project.scriptText,
      overview: typeof d.overview === "string" ? d.overview : project.overview,
      scriptConfirmed: d.scriptConfirmed === true,
      settings:
        d.settings && typeof d.settings === "object"
          ? { ...project.settings, ...(d.settings as object) }
          : project.settings,
      assets: Array.isArray(d.assets)
        ? (d.assets as ManjuProjectDraft["assets"])
        : project.assets,
      shots: Array.isArray(d.shots)
        ? (d.shots as ManjuProjectDraft["shots"])
        : project.shots,
      episodes: Array.isArray(d.episodes)
        ? (d.episodes as ManjuProjectDraft["episodes"])
        : project.episodes,
      series:
        d.series && typeof d.series === "object"
          ? (d.series as ManjuProjectDraft["series"])
          : project.series,
    });
    await flushSave(projectId);
    toast.success("已恢复快照");
  };

  const runNovelAnalyze = async () => {
    if (!project.scriptText.trim()) {
      toast.error("请先录入长文或剧本");
      return;
    }
    const ok = await confirmDialog({
      title: "长文拆集？",
      description:
        "将根据正文生成梗概、题材标签与分集草案（含原文起止引文）。不改动已有资产与镜头；已有分集标题可被调整。",
      confirmText: "开始拆集",
      cancelText: "取消",
    });
    if (!ok) return;
    try {
      setAnalyzing(projectId, true);
      await flushSave(projectId);
      const job = await submitWorkflowSkill({
        project,
        skill: "novel_analyze",
      });
      updateProject(projectId, { lastAnalyzeJobId: job.id });
      toast.message("AI 正在长文拆集…");
    } catch (e) {
      setAnalyzing(projectId, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  return (
    <div className="manju-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="manju-overview__title">{project.title}</h1>
          <p className="manju-overview__lede">
            三栏工作室：左侧导航设定与分集，中间主舞台制作，右侧 Agent 编排技能。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ManjuReviewButton projectId={projectId} />
          <Button
            size="sm"
            variant="outline"
            disabled={analyzing || !project.scriptText.trim()}
            onClick={() => void runNovelAnalyze()}
          >
            {analyzing ? "处理中…" : "长文拆集"}
          </Button>
        </div>
      </div>
      <div className="manju-overview__grid">
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className="manju-overview__card">
            <span className="manju-overview__card-label">{card.label}</span>
            <span className="manju-overview__card-value">{card.value}</span>
            <span className="manju-overview__card-hint">{card.hint}</span>
          </Link>
        ))}
      </div>

      {gridShots.length > 0 ? (
        <div className="manju-overview__snapshots">
          <h2 className="text-sm">宫格分镜预览</h2>
          <div className="manju-grid-preview">
            {gridShots.map((s) => (
              <div key={s.id} className="manju-grid-preview__cell">
                <JoyAssetThumb
                  url={s.storyboardImageUrl!}
                  alt={`格 ${s.index}`}
                  size="md"
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="manju-overview__snapshots">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm">草稿版本</h2>
          <Button size="sm" variant="outline" onClick={() => void saveSnapshot()}>
            保存快照
          </Button>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            尚无快照。重大规划前可先存一份，便于回退。
          </p>
        ) : (
          <div className="manju-overview__snapshots-list">
            {snapshots.map((snap) => (
              <div key={snap.id} className="manju-overview__snapshot">
                <span>
                  {snap.label}
                  <em className="ml-2 not-italic text-muted-foreground">
                    {new Date(snap.createdAt).toLocaleString("zh-CN")}
                  </em>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void restoreSnapshot(snap)}
                >
                  恢复
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
