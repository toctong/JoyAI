"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2, PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { cn } from "@/shared/lib/utils";
import { ManjuModelBar } from "./manju-studio";
import { ManjuStepNav } from "./manju-step-nav";
import { ManjuStoryboardViewBar } from "./manju-storyboard-view-bar";
import { ManjuFlowGuideBar } from "./manju-flow-guide";
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
import { getStepFlowGuide } from "./lib/flow-guide";
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
const NAV_COLLAPSE_KEY = "manju-nav-collapsed";

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
  const [navCollapsed, setNavCollapsed] = useState(false);
  const { toolbar } = useManjuHeaderSlotView();

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
    try {
      setNavCollapsed(localStorage.getItem(NAV_COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleNavCollapsed = useCallback(() => {
    setNavCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(NAV_COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.manjuChrome = "";
    return () => {
      delete document.documentElement.dataset.manjuChrome;
    };
  }, []);

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
  const flowGuide = getStepFlowGuide(step, project, { view });

  const runFlowGuide = () => {
    const pulseFocus = (key: string, tip: string) => {
      const el = document.querySelector<HTMLElement>(
        `[data-manju-focus='${key}']`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("manju-focus-pulse");
      window.setTimeout(() => el?.classList.remove("manju-focus-pulse"), 1600);
      toast.message(tip);
    };

    switch (flowGuide.intent) {
      case "next":
        void advance();
        return;
      case "go-script":
        go("script");
        return;
      case "go-assets":
        go("assets");
        return;
      case "go-prompts":
        go("storyboard-script", { view: "prompts", ep: episodeId });
        return;
      case "confirm-script":
        updateProject(projectId, { scriptConfirmed: true });
        toast.success("脚本已确认，接下来去写提示词");
        go("storyboard-script", { view: "prompts", ep: episodeId });
        return;
      case "focus-plan":
        pulseFocus("plan", "请点高亮的「规划分镜」");
        return;
      case "focus-generate":
        if (step === "storyboard-script" && view === "prompts") {
          go("storyboard-script", { view: null, ep: episodeId });
          window.setTimeout(
            () => pulseFocus("generate", "请点高亮的「开始生成」"),
            120,
          );
          return;
        }
        pulseFocus("generate", "请点高亮的「开始生成」");
        return;
      case "focus-prompts":
        pulseFocus("prompts", "请点高亮的「AI 编写全部提示词」");
        return;
      default:
        return;
    }
  };

  const storyboardView =
    step === "storyboard-script"
      ? view === "prompts"
        ? ("prompts" as const)
        : ("shots" as const)
      : undefined;

  return (
    <div
      className={cn(
        "manju-workbench",
        navCollapsed && "manju-workbench--nav-collapsed",
      )}
    >
      <ManjuStepNav
        project={project}
        currentId={step}
        completed={completed}
        collapsed={navCollapsed}
        onToggleCollapse={toggleNavCollapsed}
        onProjectTitleChange={(title) => updateProject(projectId, { title })}
        onSelect={(id) => go(id)}
        onSuggested={() => void runSuggested()}
      />
      <section className="manju-main">
        <header className="manju-main__header">
          <div className="manju-main__header-left">
            {navCollapsed ? (
              <button
                type="button"
                className="manju-main__nav-toggle"
                onClick={toggleNavCollapsed}
                title="展开侧栏"
                aria-label="展开侧栏"
              >
                <PanelLeft className="size-4" />
              </button>
            ) : null}
            <div className="manju-main__header-toolbar">{toolbar}</div>
            <span
              className={cn(
                "manju-main__save",
                saving && "is-saving",
                analyzing && "is-busy",
              )}
            >
              {analyzing ? "处理中…" : saving ? "保存中…" : "已保存"}
            </span>
          </div>

          <div className="manju-main__actions">
            <ManjuModelBar project={project} />
            <div className="manju-chrome">
              <button
                type="button"
                className="manju-chrome-btn manju-chrome-btn--icon"
                onClick={exportJson}
                title="导出完整草稿 JSON"
                aria-label="导出"
              >
                <Download className="size-3.5" />
              </button>
            </div>
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
          <ManjuFlowGuideBar guide={flowGuide} onCta={runFlowGuide} />
          {step === "storyboard-script" ||
          step === "storyboard-video" ||
          step === "preview" ? (
            <ManjuStoryboardViewBar
              project={project}
              episodeId={episodeId}
              view={storyboardView}
              onSelectView={
                step === "storyboard-script"
                  ? (next) =>
                      go("storyboard-script", {
                        view: next === "prompts" ? "prompts" : null,
                        ep: episodeId,
                      })
                  : undefined
              }
              onSelectEpisode={(ep) =>
                go(step, {
                  ep,
                  view: step === "storyboard-script" ? view : null,
                })
              }
            />
          ) : null}
          {step === "script" ? <ScriptStep project={project} /> : null}
          {step === "video-settings" ? (
            <VideoSettingsStep project={project} />
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
