"use client";

import { useState } from "react";
import { Copy, Loader2, Pencil, Sparkles } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { copyText } from "@/shared/lib/clipboard";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import { ManjuPromptField } from "../manju-prompt-field";
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
  if (img && vid) return "齐" as const;
  if (img || vid) return "半" as const;
  return "空" as const;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;

  const filled = visibleShots.filter(
    (s) => s.imagePrompt?.trim() && s.videoPrompt?.trim(),
  ).length;

  const editing = editingId
    ? (project.shots.find((s) => s.id === editingId) ?? null)
    : null;
  const previewing = previewId
    ? (project.shots.find((s) => s.id === previewId) ?? null)
    : null;

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
      await submitWorkflowSkill({
        project,
        skill: "author_prompts",
        episodeId,
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
    <>
      <div className="manju-panel">
        <div className="manju-step-bar">
          <div>
            <div className="text-base">分镜提示词</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              已齐 {filled}/{visibleShots.length} · 点卡片编辑画面/视频提示词
            </p>
          </div>
          <Button
            size="sm"
            data-manju-focus="prompts"
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

        <div className="manju-shot-grid">
          {visibleShots.map((shot) => {
            const cov = promptCoverage(shot);
            return (
              <article
                key={shot.id}
                className="manju-asset-card manju-asset-card--text manju-asset-card--interactive"
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPreviewOpen(false);
                  setEditingId(shot.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreviewOpen(false);
                    setEditingId(shot.id);
                  }
                }}
              >
                <div className="manju-asset-card__body">
                  <div
                    className="manju-asset-card__top"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="manju-asset-card__title">
                      镜 {String(shot.index).padStart(2, "0")}
                    </h3>
                    <span
                      className={cn(
                        "manju-prompt-cov",
                        cov === "齐" && "is-ok",
                        cov === "半" && "is-half",
                        cov === "空" && "is-empty",
                      )}
                    >
                      {cov}
                    </span>
                    <button
                      type="button"
                      className="manju-icon-btn"
                      aria-label="编辑提示词"
                      onClick={() => {
                        setPreviewOpen(false);
                        setEditingId(shot.id);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="manju-asset-card__desc-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewOpen(false);
                      setEditingId(shot.id);
                    }}
                  >
                    {shot.visual.trim() || (
                      <span className="opacity-50">（无画面描述）</span>
                    )}
                  </button>

                  <p className="manju-asset-card__prompt">
                    {shot.imagePrompt?.trim()
                      ? `图：${shot.imagePrompt}`
                      : "缺画面提示词"}
                  </p>
                  <p className="manju-asset-card__alias-text">
                    {shot.videoPrompt?.trim()
                      ? `视频：${shot.videoPrompt}`
                      : "缺视频提示词"}
                  </p>

                  <div
                    className="manju-asset-card__footer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="manju-asset-card__actions">
                      <Button
                        variant="outline"
                        size="sm"
                        className="manju-asset-card__action"
                        disabled={!shot.imagePrompt?.trim()}
                        onClick={() =>
                          void copyPrompt(
                            "画面提示词",
                            shot.imagePrompt?.trim() ?? "",
                          )
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        画面词
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="manju-asset-card__action"
                        disabled={!shot.videoPrompt?.trim()}
                        onClick={() =>
                          void copyPrompt(
                            "视频提示词",
                            shot.videoPrompt?.trim() ?? "",
                          )
                        }
                      >
                        <Copy className="h-3.5 w-3.5" />
                        视频词
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="manju-asset-card__action"
                        onClick={() => setPreviewId(shot.id)}
                      >
                        预览词
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <Dialog
        open={Boolean(previewing)}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      >
        <DialogContent className="manju-dialog max-w-xl gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
          {previewing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  预览将提交 · 镜{" "}
                  {String(previewing.index).padStart(2, "0")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-[12px] leading-relaxed">
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      实际生图将提交
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        void copyPrompt(
                          "生图提示词",
                          buildShotImagePrompt(previewing, project),
                        )
                      }
                    >
                      <Copy className="h-3 w-3" />
                      复制
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {buildShotImagePrompt(previewing, project)}
                  </p>
                </div>
                <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">
                      实际生视频将提交
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() =>
                        void copyPrompt(
                          "生视频提示词",
                          buildShotVideoPrompt(previewing, project),
                        )
                      }
                    >
                      <Copy className="h-3 w-3" />
                      复制
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {buildShotVideoPrompt(previewing, project)}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setPreviewId(null)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingId(null);
            setPreviewOpen(false);
          }
        }}
      >
        <DialogContent className="manju-dialog max-w-xl gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  编辑提示词 · 镜 {String(editing.index).padStart(2, "0")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      void copyPrompt("镜号", `#${editing.index}`)
                    }
                  >
                    <Copy className="h-3 w-3" />
                    复制 #{editing.index}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!editing.imagePrompt?.trim()}
                    onClick={() =>
                      void copyPrompt(
                        "画面提示词",
                        editing.imagePrompt?.trim() ?? "",
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
                    disabled={!editing.videoPrompt?.trim()}
                    onClick={() =>
                      void copyPrompt(
                        "视频提示词",
                        editing.videoPrompt?.trim() ?? "",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                    复制视频词
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label>画面提示词 imagePrompt（键入 @ 引用资产）</Label>
                  <ManjuPromptField
                    value={editing.imagePrompt ?? ""}
                    onChange={(imagePrompt) =>
                      updateShot(project.id, editing.id, { imagePrompt })
                    }
                    assets={project.assets}
                    preferredAssetIds={editing.assetRefs}
                    placeholder="例：@[小美] 站在 @[雨巷] 灯下回望，中景，冷色雨雾…"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>视频提示词 videoPrompt</Label>
                  <ManjuPromptField
                    value={editing.videoPrompt ?? ""}
                    onChange={(videoPrompt) =>
                      updateShot(project.id, editing.id, { videoPrompt })
                    }
                    assets={project.assets}
                    preferredAssetIds={editing.assetRefs}
                    placeholder="例：@[小美] 缓步走近，镜头缓慢推进…"
                  />
                </div>

                <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      {previewOpen ? "收起预览" : "预览将提交的提示词"}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      <div>
                        <div className="mb-1 text-foreground">
                          实际生图将提交
                        </div>
                        <p className="whitespace-pre-wrap text-foreground/80">
                          {buildShotImagePrompt(editing, project)}
                        </p>
                      </div>
                      <div>
                        <div className="mb-1 text-foreground">
                          实际生视频将提交
                        </div>
                        <p className="whitespace-pre-wrap text-foreground/80">
                          {buildShotVideoPrompt(editing, project)}
                        </p>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setPreviewOpen(false);
                  }}
                >
                  完成
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
