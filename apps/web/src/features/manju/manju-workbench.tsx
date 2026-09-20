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
import { stepCanAdvance, type ManjuPanel } from "./manju-types";
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
  const completed = useMemo(
    () => new Set(project?.completedSteps ?? []),
    [project?.completedSteps],
  );

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
