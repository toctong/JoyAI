"use client";

import { useMemo, useState } from "react";
import { Copy, Loader2, Sparkles } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { copyText } from "@/shared/lib/clipboard";
import { toast } from "@/shared/lib/toast";
import { submitManjuAnalyzeJob } from "../manju-api";
import { ManjuMdField } from "../manju-md-field";
import { useManjuStore } from "../manju-store";
import {
  buildShotImagePrompt,
  buildShotVideoPrompt,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";

function promptCoverage(shot: ManjuShotDraft) {
  const img = Boolean(shot.imagePrompt?.trim());
  const vid = Boolean(shot.videoPrompt?.trim());
  if (img && vid) return "齐";
  if (img || vid) return "半";
  return "空";
}

export function PromptsStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const updateShot = useManjuStore((s) => s.updateShot);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const flushSave = useManjuStore((s) => s.flushSave);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const [openPreview, setOpenPreview] = useState<Record<string, boolean>>({});

  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;

  const filled = visibleShots.filter(
    (s) => s.imagePrompt?.trim() && s.videoPrompt?.trim(),
  ).length;

  const defaultOpen = useMemo(
    () =>
      visibleShots
        .filter((s) => !s.imagePrompt?.trim() || !s.videoPrompt?.trim())
        .slice(0, 3)
        .map((s) => s.id),
    [visibleShots],
  );

  const runAuthorPrompts = async () => {
    if (visibleShots.length === 0) {
      toast.error("请先规划分镜");
      return;
    }
    if (!project.scriptConfirmed) {
      toast.error("请先在分镜页确认脚本，再编写提示词");
      return;
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      const shotBrief = visibleShots
        .map((s) => {
          const names = project.assets
            .filter((a) => s.assetRefs.includes(a.id))
            .map((a) => a.name)
            .join("、");
          return `#${s.index} 画面:${s.visual} 对白:${s.dialogue || "无"} 资产:${names || "无"}`;
        })
        .join("\n");
      await submitManjuAnalyzeJob({
        projectId: project.id,
        scriptText: `风格：${project.settings.style}\n画幅：${project.settings.ratio}\n说明：每条镜头的序号必须使用下列全局 #index，不要从 1 重新编号。\n\n已锁定镜头：\n${shotBrief}`,
        purpose: "author_prompts",
        modelId: project.settings.llmModelId,
      });
      toast.success("已提交编写提示词任务");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const copyPrompt = async (label: string, text: string) => {
    const ok = await copyText(text);
    if (ok) toast.success(`已复制${label}`);
    else toast.error("复制失败");
  };

  if (visibleShots.length === 0) {
    return (
      <div className="manju-card">
        <div className="manju-card__title">分镜提示词</div>
        <p className="manju-card__desc">
          尚无分镜。请先在分镜页用 AI 规划，或手动新增镜头。
        </p>
      </div>
    );
  }

  return (
    <div className="manju-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">分镜提示词</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            已齐 {filled}/{visibleShots.length} · index 必须是全局镜号（如 #3）·
            提交前拼装「图N」与 Avoid
          </p>
        </div>
        <Button
          size="sm"
          disabled={analyzing}
          onClick={() => void runAuthorPrompts()}
        >
          {analyzing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          AI 编写全部提示词
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={defaultOpen}
        className="rounded-lg border border-border bg-card px-3"
      >
        {visibleShots.map((shot) => {
          const cov = promptCoverage(shot);
          const previewOpen = Boolean(openPreview[shot.id]);
          return (
            <AccordionItem key={shot.id} value={shot.id}>
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex items-center gap-2 text-left">
                  <span className="manju-shot-card__index !mb-0">
                    {String(shot.index).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {shot.visual || "（无画面描述）"}
                  </span>
                  <span
                    className={
                      cov === "齐"
                        ? "ml-auto text-[11px] text-emerald-600 dark:text-emerald-400"
                        : cov === "半"
                          ? "ml-auto text-[11px] text-amber-600 dark:text-amber-400"
                          : "ml-auto text-[11px] text-muted-foreground"
                    }
                  >
                    {cov}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      void copyPrompt("镜号", `#${shot.index}`)
                    }
                  >
                    <Copy className="h-3 w-3" />
                    复制 #{shot.index}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!shot.imagePrompt?.trim()}
                    onClick={() =>
                      void copyPrompt(
                        "画面提示词",
                        shot.imagePrompt?.trim() ?? "",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                    复制画面词
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!shot.videoPrompt?.trim()}
                    onClick={() =>
                      void copyPrompt(
                        "视频提示词",
                        shot.videoPrompt?.trim() ?? "",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                    复制视频词
                  </Button>
                </div>
                <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                  画面提示词 imagePrompt（可用 @[角色名]）
                </label>
                <ManjuMdField
                  value={shot.imagePrompt ?? ""}
                  onChange={(imagePrompt) =>
                    updateShot(project.id, shot.id, { imagePrompt })
                  }
                  placeholder="例：@[小美] 站在 @[雨巷] 灯下回望，中景，冷色雨雾…"
                  height={120}
                  hideToolbar
                />

                <label className="mb-1 mt-3 block text-[11px] font-medium text-muted-foreground">
                  视频提示词 videoPrompt
                </label>
                <ManjuMdField
                  value={shot.videoPrompt ?? ""}
                  onChange={(videoPrompt) =>
                    updateShot(project.id, shot.id, { videoPrompt })
                  }
                  placeholder="例：@[小美] 缓步走近，镜头缓慢推进…"
                  height={100}
                  hideToolbar
                  className="mb-1"
                />

                <Collapsible
                  open={previewOpen}
                  onOpenChange={(open) =>
                    setOpenPreview((prev) => ({ ...prev, [shot.id]: open }))
                  }
                  className="mt-3"
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      {previewOpen ? "收起预览" : "预览将提交的提示词"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      <div>
                        <div className="mb-1 font-medium text-foreground">
                          实际生图将提交
                        </div>
                        <p className="whitespace-pre-wrap text-foreground/80">
                          {buildShotImagePrompt(shot, project)}
                        </p>
                      </div>
                      <div>
                        <div className="mb-1 font-medium text-foreground">
                          实际生视频将提交
                        </div>
                        <p className="whitespace-pre-wrap text-foreground/80">
                          {buildShotVideoPrompt(shot, project)}
                        </p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
