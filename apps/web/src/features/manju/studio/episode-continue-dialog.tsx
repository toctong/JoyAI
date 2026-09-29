"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { useManjuStore } from "../manju-store";
import { ScriptAiPanel } from "../script-ai/script-ai-panel";
import {
  applyContinueEpisodeResult,
  buildContinueEpisodeSeed,
  defaultContinueUserPrompt,
} from "../lib/continue-episode";
import { manjuStudioHref } from "./manju-studio-routes";

type Props = {
  projectId: string;
  fromEpisodeId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (newEpisodeId: string) => void;
};

export function EpisodeContinueDialog({
  projectId,
  fromEpisodeId,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const project = useManjuStore((s) =>
    s.projects.find((p) => p.id === projectId),
  );
  const updateProject = useManjuStore((s) => s.updateProject);

  const seed = useMemo(() => {
    if (!project || !fromEpisodeId) return null;
    return buildContinueEpisodeSeed(project, fromEpisodeId);
  }, [project, fromEpisodeId]);

  if (!open) return null;

  if (!project || !seed) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>无法续写</DialogTitle>
          <p className="text-sm text-muted-foreground">未找到上一集。</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="manju-continue-dialog flex h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden border-border p-0 sm:rounded-xl">
        <DialogTitle className="sr-only">
          AI 写下一集 · 第{seed.nextIndex}集
        </DialogTitle>
        <ScriptAiPanel
          projectId={projectId}
          modelId={project.settings.llmModelId || undefined}
          scriptText=""
          continueSeed={seed}
          chatNamespace="script-ai-continue"
          persistRemote={false}
          hideScriptRef
          brandSubtitle={`续写第${seed.nextIndex}集 · 应用即新建分集`}
          applyButtonLabel="创建为下一集"
          appliedLabel="已创建下一集"
          applySuccessMessage={`已创建第${seed.nextIndex}集`}
          initialDraftPrompt={defaultContinueUserPrompt(seed)}
          onCollapse={() => onOpenChange(false)}
          onApplyScript={(script, meta) => {
            const result = applyContinueEpisodeResult({
              project,
              seed,
              rawScript: script,
              hook: meta?.hook,
              summary: meta?.summary,
              tags: meta?.tags,
            });
            updateProject(projectId, {
              episodes: result.episodes,
              ...(result.tags ? { tags: result.tags } : {}),
            });
            onCreated?.(result.newEpisode.id);
            void (async () => {
              const go = await confirmDialog({
                title: "下一集已创建",
                description: `「${result.newEpisode.title}」已写入剧集列表。是否立即制作视频？`,
                confirmText: "制作视频",
                cancelText: "稍后",
              });
              if (go) {
                const href = manjuStudioHref(projectId, "episode", {
                  epId: result.newEpisode.id,
                });
                const win = window.open(href, "_blank", "noopener,noreferrer");
                if (!win) {
                  toast.error("浏览器拦截了新标签，请允许弹窗后再试");
                }
              }
              onOpenChange(false);
            })();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
