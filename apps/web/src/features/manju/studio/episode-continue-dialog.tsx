"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { ScriptAiPanel } from "../script-ai/script-ai-panel";
import {
  applyContinueEpisodeResult,
  buildContinueEpisodeSeed,
  defaultContinueUserPrompt,
  newCharacterNamesNotInAssets,
  type ContinueEpisodeSeed,
} from "../lib/continue-episode";
import { openManjuProduceTab } from "./manju-studio-routes";
import { cn } from "@/shared/lib/utils";

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
  const addAsset = useManjuStore((s) => s.addAsset);
  const renameAsset = useManjuStore((s) => s.renameAsset);

  /** 打开时冻结 seed，避免创建后 nextIndex 跳号 */
  const [frozenSeed, setFrozenSeed] = useState<ContinueEpisodeSeed | null>(
    null,
  );
  const [finale, setFinale] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  useEffect(() => {
    if (!open || !project || !fromEpisodeId) {
      if (!open) {
        setFrozenSeed(null);
        setFinale(false);
      }
      return;
    }
    const seed = buildContinueEpisodeSeed(project, fromEpisodeId, {
      finale: false,
    });
    setFrozenSeed(seed);
    setFinale(false);
    setSessionKey((k) => k + 1);
    // 仅在打开瞬间冻结；勿依赖 project 更新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromEpisodeId]);

  const seed = useMemo(() => {
    if (!frozenSeed) return null;
    return { ...frozenSeed, finale };
  }, [frozenSeed, finale]);

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
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant={finale ? "default" : "outline"}
            className={cn("h-7 text-xs", finale && "shadow-none")}
            onClick={() => setFinale((v) => !v)}
          >
            {finale ? "完结模式 · 开" : "完结本集（勿留钩子）"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {finale ? "结尾收束，hook 为空" : "默认留下集钩子"}
          </span>
        </div>
        <ScriptAiPanel
          key={`${seed.fromEpisodeId}-${sessionKey}-${finale ? "f" : "c"}`}
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
            onOpenChange(false);

            const newcomers = newCharacterNamesNotInAssets(
              result.newEpisode.sourceText,
              project.assets,
            );
            void (async () => {
              if (newcomers.length > 0) {
                const add = await confirmDialog({
                  title: "检测到新角色",
                  description: `是否加入资产库：${newcomers.join("、")}？（暂无参考图，可稍后补）`,
                  confirmText: "加入资产",
                  cancelText: "跳过",
                });
                if (add) {
                  for (const name of newcomers) {
                    const id = addAsset(projectId, "character");
                    renameAsset(projectId, id, name);
                  }
                  toast.success(`已添加角色：${newcomers.join("、")}`);
                }
              }
              const go = await confirmDialog({
                title: "下一集已创建",
                description: `「${result.newEpisode.title}」已写入剧集列表。是否立即规划分镜并制作？`,
                confirmText: "规划并制作",
                cancelText: "稍后",
              });
              if (go) {
                openManjuProduceTab(projectId, result.newEpisode.id, {
                  sameTab: true,
                  autoPlan: true,
                });
              }
            })();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
