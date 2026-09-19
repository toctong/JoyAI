"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/shared/lib/toast";
import { ManjuModelBar, ManjuStudioShell } from "./manju-studio";
import { useManjuStore } from "./manju-store";
import { useManjuJobBridge } from "./use-manju-jobs";
import type { ManjuPanel } from "./manju-types";
import { ScriptStep } from "./steps/script-step";
import { VideoSettingsStep } from "./steps/video-settings-step";
import { AssetsStep } from "./steps/assets-step";
import { StoryboardScriptStep } from "./steps/storyboard-script-step";
import { StoryboardVideoStep } from "./steps/storyboard-video-step";
import { PreviewStep } from "./steps/preview-step";
import { PromptsStep } from "./steps/prompts-step";
import "./manju-chrome.css";

const PANELS: ManjuPanel[] = [
  "overview",
  "characters",
  "scenes",
  "props",
  "timeline",
  "prompts",
  "preview",
];

function parsePanel(raw: string | null): ManjuPanel {
  return PANELS.includes(raw as ManjuPanel) ? (raw as ManjuPanel) : "overview";
}

export function ManjuWorkbench({ projectId }: { projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const loadProject = useManjuStore((s) => s.loadProject);
  const updateProject = useManjuStore((s) => s.updateProject);
  const saving = useManjuStore((s) => Boolean(s.savingIds[projectId]));
  const [loading, setLoading] = useState(!project);
  const panel = parsePanel(searchParams.get("panel"));

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

  const setPanel = useCallback(
    (next: ManjuPanel) => {
      router.replace(`/manju/${projectId}?panel=${next}`);
    },
    [projectId, router],
  );

  const exportJson = useCallback(() => {
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title || "manju"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [project]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 bg-[#0c0c10] text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载漫剧工作台…
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#0c0c10] text-sm text-zinc-400">
        <p>项目不存在或已删除</p>
        <Button onClick={() => router.replace("/manju")}>返回项目列表</Button>
      </div>
    );
  }

  return (
    <ManjuStudioShell
      project={project}
      panel={panel}
      saving={saving}
      onPanel={setPanel}
      onTitle={(title) => updateProject(projectId, { title })}
    >
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={exportJson}>
          <Download className="h-4 w-4" />
          导出
        </Button>
      </div>
      {panel === "overview" ? (
        <div className="flex flex-col gap-4">
          <ManjuModelBar project={project} />
          <ScriptStep project={project} />
          <VideoSettingsStep project={project} />
        </div>
      ) : null}
      {panel === "characters" ? (
        <AssetsStep project={project} lockedKind="character" />
      ) : null}
      {panel === "scenes" ? (
        <AssetsStep project={project} lockedKind="scene" />
      ) : null}
      {panel === "props" ? (
        <AssetsStep project={project} lockedKind="prop" />
      ) : null}
      {panel === "timeline" ? (
        <div className="flex flex-col gap-6">
          <StoryboardScriptStep project={project} />
          <StoryboardVideoStep project={project} />
        </div>
      ) : null}
      {panel === "prompts" ? <PromptsStep project={project} /> : null}
      {panel === "preview" ? <PreviewStep project={project} /> : null}
    </ManjuStudioShell>
  );
}
