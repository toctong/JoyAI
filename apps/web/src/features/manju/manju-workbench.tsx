"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { cn } from "@/shared/lib/utils";
import { ManjuModelBar } from "./manju-studio";
import { ManjuStepNav } from "./manju-step-nav";
import { ManjuGenerateCombo } from "./manju-generate-combo";
import {
  ManjuHeaderSlotsProvider,
  useManjuHeaderSlotView,
} from "./manju-header-slots";
import { useManjuStore } from "./manju-store";
import { useManjuJobBridge } from "./use-manju-jobs";
import {
  getNextStep,
  MANJU_STEPS,
  type ManjuStepId,
} from "./config/manju-steps";
import { stepCanAdvance, getWorkflowNextAction, type ManjuPanel } from "./manju-types";
import { submitWorkflowSkill } from "./lib/workflow-skill";
import { draftFromProject } from "./manju-api";
import { ScriptStep } from "./steps/script-step";
import { VideoSettingsStep } from "./steps/video-settings-step";
import { AssetsStep } from "./steps/assets-step";
import { StoryboardScriptStep } from "./steps/storyboard-script-step";
import { StoryboardVideoStep } from "./steps/storyboard-video-step";
import { PreviewStep } from "./steps/preview-step";
import { PromptsStep } from "./steps/prompts-step";
import "./manju-chrome.css";

const STEP_IDS = new Set<ManjuStepId>(MANJU_STEPS.map((s) => s.id));

function stepFromLegacyPanel(panel: string | null): ManjuStepId | null {
  if (panel === "characters" || panel === "scenes" || panel === "props") {
    return "assets";
  }
  if (panel === "timeline") return "storyboard-script";
  if (panel === "prompts") return "storyboard-script";
  if (panel === "preview") return "preview";
  if (panel === "overview") return "script";
  return null;
}

function parseStep(raw: string | null, panel: string | null): ManjuStepId {
  if (raw && STEP_IDS.has(raw as ManjuStepId)) return raw as ManjuStepId;
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= MANJU_STEPS.length) {
    return MANJU_STEPS[n - 1]!.id;
  }
  return stepFromLegacyPanel(panel) ?? "script";
}

export function ManjuWorkbench({ projectId }: { projectId: string }) {
  return (
    <ManjuHeaderSlotsProvider>
      <ManjuWorkbenchBody projectId={projectId} />
    </ManjuHeaderSlotsProvider>
  );
}

function ManjuWorkbenchBody({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const loadProject = useManjuStore((s) => s.loadProject);
  const updateProject = useManjuStore((s) => s.updateProject);
  const markStepComplete = useManjuStore((s) => s.markStepComplete);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const flushSave = useManjuStore((s) => s.flushSave);
  const saving = useManjuStore((s) => Boolean(s.savingIds[projectId]));
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[projectId]));
  const [loading, setLoading] = useState(!project);
  const { toolbar, generateAction, tools } = useManjuHeaderSlotView();
  const heldAction = useRef(generateAction);
  const heldTools = useRef(tools);
  if (generateAction) heldAction.current = generateAction;
  if (tools) heldTools.current = tools;

  const panel = searchParams.get("panel") as ManjuPanel | null;
  const step = parseStep(searchParams.get("step"), panel);
  const episodeId = searchParams.get("ep");
  const view =
    searchParams.get("view") === "prompts" || panel === "prompts"
      ? "prompts"
      : "shots";
  const assetKind =
    panel === "characters" || panel === "scenes" || panel === "props"
      ? panel === "characters"
        ? "character"
        : panel === "scenes"
          ? "scene"
          : "prop"
      : searchParams.get("kind") === "character" ||
          searchParams.get("kind") === "scene" ||
          searchParams.get("kind") === "prop"
        ? (searchParams.get("kind") as "character" | "scene" | "prop")
        : undefined;

  useManjuJobBridge(projectId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadProject(projectId);
      } catch (e) {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : "加载项目失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProject, projectId]);

  const hrefFor = useCallback(
    (
      next: ManjuStepId,
      extra?: { view?: string | null; ep?: string | null; kind?: string | null },
    ) => {
      const q = new URLSearchParams();
      q.set("step", next);
      const ep = extra && "ep" in extra ? extra.ep : episodeId;
      const nextView = extra && "view" in extra ? extra.view : null;
      if (
        ep &&
        (next === "storyboard-script" ||
          next === "storyboard-video" ||
          next === "preview")
      ) {
        q.set("ep", ep);
      }
      if (next === "storyboard-script" && nextView === "prompts") {
        q.set("view", "prompts");
      }
      if (next === "assets" && extra?.kind) q.set("kind", extra.kind);
      return `/manju/${projectId}?${q.toString()}`;
    },
    [episodeId, projectId],
  );

  const go = useCallback(
    (
      next: ManjuStepId,
      extra?: { view?: string | null; ep?: string | null; kind?: string | null },
    ) => {
      router.replace(hrefFor(next, extra));
    },
    [hrefFor, router],
  );

  const advance = useCallback(async () => {
    if (!project) return;
    const gate = stepCanAdvance(step, project);
    if (!gate.ok) {
      toast.error(gate.reason ?? "这一步还没完成");
      return;
    }
    if (step === "assets") {
      const hasShots = project.shots.length > 0;
      const ok = await confirmDialog({
        title: hasShots ? "确认重新进入分镜脚本？" : "确认进入分镜脚本？",
        description: hasShots
          ? "将根据剧本与资产规划分镜。已有镜头文案可能被覆盖，分镜图和视频会尽量保留。"
          : "将根据剧本与已配图资产拆解分镜，并为镜头关联场景、角色、道具。是否继续？",
        confirmText: hasShots ? "确认并规划" : "确认并生成",
        cancelText: "取消",
      });
      if (!ok) return;
      if (project.scriptText.trim().length >= 20) {
        try {
          setAnalyzing(projectId, true);
          await flushSave(projectId);
          await submitWorkflowSkill({
            project,
            skill: "script_plan",
            episodeId,
          });
          toast.success("已提交分镜规划");
        } catch (e) {
          setAnalyzing(projectId, false);
          toast.error(e instanceof Error ? e.message : "分镜规划提交失败");
          return;
        }
      }
    }
    if (step === "storyboard-script") {
      if (!project.scriptConfirmed) {
        toast.error("请先「确认脚本」，再进分镜视频");
        return;
      }
      const ok = await confirmDialog({
        title: "进入分镜视频？",
        description:
          "将按已确认的分镜脚本生成镜头视频。图生视频模式下，没有分镜静帧的镜头会被跳过。",
        confirmText: "进入视频",
        cancelText: "取消",
      });
      if (!ok) return;
    }
    markStepComplete(projectId, step);
    const next = getNextStep(step);
    if (!next) {
      toast.message("已经是最后一步");
      return;
    }
    go(next.id);
  }, [
    episodeId,
    flushSave,
    go,
    markStepComplete,
    project,
    projectId,
    setAnalyzing,
    step,
  ]);

  const exportJson = useCallback(() => {
    if (!project) return;
    const payload = {
      title: project.title,
      draft: draftFromProject(project),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "manju"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  const nextStep = getNextStep(step);
  const suggested = useMemo(
    () => (project ? getWorkflowNextAction(project) : null),
    [project],
  );
  const completed = useMemo(
    () => new Set(project?.completedSteps ?? []),
    [project?.completedSteps],
  );

  const runSuggested = useCallback(async () => {
    if (!project || !suggested) return;
    if (!suggested.skill) {
      if (suggested.label === "确认脚本") {
        updateProject(projectId, { scriptConfirmed: true });
        const needAssets = !project.assets.some((a) => a.imageUrl);
        toast.success(
          needAssets ? "脚本已确认，请先生成设定图" : "脚本已确认，可以写提示词",
        );
        if (needAssets) go("assets");
        else go("storyboard-script", { view: "prompts" });
        return;
      }
      if (suggested.panel === "prompts") {
        go("storyboard-script", { view: "prompts" });
        return;
      }
      go(suggested.stepId);
      return;
    }
    try {
      setAnalyzing(projectId, true);
      await flushSave(projectId);
      await submitWorkflowSkill({
        project,
        skill: suggested.skill,
        episodeId,
      });
      toast.success(`已提交${suggested.label}`);
      if (suggested.skill === "author_prompts") {
        go("storyboard-script", { view: "prompts" });
      } else if (suggested.skill === "script_plan") {
        go("storyboard-script");
      } else if (
        suggested.skill === "plan_episodes" ||
        suggested.skill === "series_memory"
      ) {
        go("script");
      } else {
        go("assets");
      }
    } catch (e) {
      setAnalyzing(projectId, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  }, [
    episodeId,
    flushSave,
    go,
    project,
    projectId,
    setAnalyzing,
    suggested,
    updateProject,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-background text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载漫剧工作台…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground">
        <p>项目不存在或已删除</p>
        <Button onClick={() => router.replace("/manju")}>返回项目列表</Button>
      </div>
    );
  }

  const gate = stepCanAdvance(step, project);
  const showGenerateSlot =
    step === "assets" ||
    (step === "storyboard-script" && view !== "prompts") ||
    step === "storyboard-video" ||
    step === "preview";
  const action = showGenerateSlot
    ? (generateAction ?? heldAction.current)
    : null;
  const headerTools = !showGenerateSlot
    ? null
    : tools
      ? tools
      : generateAction
        ? null
        : heldTools.current;

  const episodeChips =
    project.episodes.length > 0 &&
    (step === "storyboard-script" ||
      step === "storyboard-video" ||
      step === "preview") ? (
      <>
        <span className="mx-1 hidden h-4 w-px bg-border sm:inline-block" />
        <button
          type="button"
          className={cn("manju-chip", !episodeId && "manju-chip--active")}
          onClick={() =>
            go(step, {
              ep: null,
              view: step === "storyboard-script" ? view : null,
            })
          }
        >
          全部
        </button>
        {project.episodes.map((ep, i) => (
          <button
            key={ep.id}
            type="button"
            className={cn("manju-chip", episodeId === ep.id && "manju-chip--active")}
            onClick={() =>
              go(step, {
                ep: ep.id,
                view: step === "storyboard-script" ? view : null,
              })
            }
          >
            {String(i + 1).padStart(2, "0")} {ep.title}
          </button>
        ))}
      </>
    ) : null;

  return (
    <div className="manju-workbench">
      <ManjuStepNav
        project={project}
        currentId={step}
        completed={completed}
        onProjectTitleChange={(title) => updateProject(projectId, { title })}
        onSelect={(id) => go(id)}
        onSuggested={() => void runSuggested()}
      />
      <section className="manju-main">
        <header className="manju-main__header">
          <div className="manju-main__header-left">
            <div className="manju-main__header-toolbar">
              {step === "storyboard-script" ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      "manju-chip",
                      view !== "prompts" && "manju-chip--active",
                    )}
                    onClick={() => go("storyboard-script", { view: null })}
                  >
                    分镜
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "manju-chip",
                      view === "prompts" && "manju-chip--active",
                    )}
                    onClick={() => go("storyboard-script", { view: "prompts" })}
                  >
                    提示词
                  </button>
                </>
              ) : null}
              {toolbar}
              {episodeChips}
            </div>
          </div>
          <div className="manju-main__actions">
            <button
              type="button"
              className="manju-tool-btn"
              onClick={exportJson}
              title="导出完整草稿 JSON（不含拼接成片）"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="manju-tool-btn__label">导出</span>
            </button>
            {headerTools ? (
              <>
                <button
                  type="button"
                  className="manju-tool-btn"
                  disabled={headerTools.add.disabled || headerTools.add.loading}
                  onClick={headerTools.add.onClick}
                >
                  {headerTools.add.loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  <span className="manju-tool-btn__label">
                    {headerTools.add.label}
                  </span>
                </button>
                {headerTools.secondary ? (
                  <button
                    type="button"
                    className="manju-tool-btn manju-tool-btn--wide"
                    disabled={
                      headerTools.secondary.disabled ||
                      headerTools.secondary.loading
                    }
                    onClick={headerTools.secondary.onClick}
                  >
                    {headerTools.secondary.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span className="manju-tool-btn__label">
                      {headerTools.secondary.label}
                    </span>
                  </button>
                ) : null}
                {headerTools.tertiary ? (
                  <button
                    type="button"
                    className="manju-tool-btn manju-tool-btn--wide"
                    disabled={
                      headerTools.tertiary.disabled ||
                      headerTools.tertiary.loading
                    }
                    onClick={headerTools.tertiary.onClick}
                  >
                    {headerTools.tertiary.loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span className="manju-tool-btn__label">
                      {headerTools.tertiary.label}
                    </span>
                  </button>
                ) : null}
              </>
            ) : null}
            {action ? (
              <ManjuGenerateCombo
                label={action.label}
                onPrimary={action.onPrimary}
                onOpenSettings={action.onOpenSettings}
                disabled={action.disabled}
                primaryDisabled={action.primaryDisabled}
                loading={action.loading || analyzing}
              />
            ) : null}
            {nextStep ? (
              <button
                type="button"
                className="manju-next-btn"
                disabled={!gate.ok || analyzing}
                title={gate.ok ? undefined : gate.reason}
                onClick={() => void advance()}
              >
                <span className="manju-next-btn__label">
                  下一步：{nextStep.label}
                </span>
              </button>
            ) : null}
          </div>
        </header>
        <div className="manju-main__body">
          {step === "script" ? <ScriptStep project={project} /> : null}
          {step === "video-settings" ? (
            <div className="flex flex-col gap-4">
              <ManjuModelBar project={project} />
              <VideoSettingsStep project={project} />
            </div>
          ) : null}
          {step === "assets" ? (
            <AssetsStep project={project} lockedKind={assetKind} />
          ) : null}
          {step === "storyboard-script" && view === "prompts" ? (
            <PromptsStep project={project} episodeId={episodeId} />
          ) : null}
          {step === "storyboard-script" && view !== "prompts" ? (
            <StoryboardScriptStep project={project} episodeId={episodeId} />
          ) : null}
          {step === "storyboard-video" ? (
            <StoryboardVideoStep project={project} episodeId={episodeId} />
          ) : null}
          {step === "preview" ? (
            <PreviewStep project={project} episodeId={episodeId} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
