"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { ManjuModelBar } from "./manju-studio";
import { ManjuStepNav } from "./manju-step-nav";
import { useManjuStore } from "./manju-store";
import { useManjuJobBridge } from "./use-manju-jobs";
import {
  getNextStep,
  getStepById,
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

  const advance = useCallback(() => {
    if (!project) return;
    const gate = stepCanAdvance(step, project);
    if (!gate.ok) {
      toast.error(gate.reason ?? "这一步还没完成");
      return;
    }
    markStepComplete(projectId, step);
    const next = getNextStep(step);
    if (!next) {
      toast.message("已经是最后一步");
      return;
    }
    go(next.id);
  }, [go, markStepComplete, project, projectId, step]);

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

  const meta = useMemo(() => getStepById(step), [step]);
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
      } else if (suggested.skill === "plan_episodes") {
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
            <div className="manju-main__step-title">
              {String(meta.index).padStart(2, "0")} {meta.label}
            </div>
            <p className="manju-main__step-hint">{meta.hint}</p>
          </div>
          <div className="manju-main__header-right">
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              {saving ? "保存中…" : "已同步"}
            </span>
            {suggested &&
            !(
              !suggested.skill &&
              suggested.stepId === step &&
              suggested.label !== "确认脚本" &&
              !(suggested.panel === "prompts" && view !== "prompts")
            ) ? (
              <Button
                variant="outline"
                size="sm"
                disabled={analyzing}
                title={suggested.detail}
                onClick={() => void runSuggested()}
              >
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {suggested.label}
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={exportJson}>
              <Download className="h-4 w-4" />
              导出
            </Button>
            {nextStep ? (
              <Button size="sm" onClick={advance}>
                下一步 · {nextStep.label}
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </header>
        <div className="manju-main__body">
          {step === "storyboard-script" ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={cn("manju-chip", view !== "prompts" && "manju-chip--active")}
                onClick={() => go("storyboard-script", { view: null })}
              >
                分镜
              </button>
              <button
                type="button"
                className={cn("manju-chip", view === "prompts" && "manju-chip--active")}
                onClick={() => go("storyboard-script", { view: "prompts" })}
              >
                提示词
              </button>
              {project.episodes.length > 0 ? (
                <>
                  <span className="mx-1 h-4 w-px bg-border" />
                  <button
                    type="button"
                    className={cn("manju-chip", !episodeId && "manju-chip--active")}
                    onClick={() => go(step, { ep: null, view })}
                  >
                    全部
                  </button>
                  {project.episodes.map((ep, i) => (
                    <button
                      key={ep.id}
                      type="button"
                      className={cn(
                        "manju-chip",
                        episodeId === ep.id && "manju-chip--active",
                      )}
                      onClick={() => go(step, { ep: ep.id, view })}
                    >
                      {String(i + 1).padStart(2, "0")} {ep.title}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          ) : null}
          {step === "storyboard-video" || step === "preview" ? (
            project.episodes.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn("manju-chip", !episodeId && "manju-chip--active")}
                  onClick={() => go(step, { ep: null })}
                >
                  全部
                </button>
                {project.episodes.map((ep, i) => (
                  <button
                    key={ep.id}
                    type="button"
                    className={cn(
                      "manju-chip",
                      episodeId === ep.id && "manju-chip--active",
                    )}
                    onClick={() => go(step, { ep: ep.id })}
                  >
                    {String(i + 1).padStart(2, "0")} {ep.title}
                  </button>
                ))}
              </div>
            ) : null
          ) : null}

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
