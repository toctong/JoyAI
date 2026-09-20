"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Loader2,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { cn } from "@/shared/lib/utils";
import { ManjuMdField } from "../manju-md-field";
import { ManjuAssetPicker } from "../manju-asset-picker";
import { useManjuStore } from "../manju-store";
import { submitImageJob } from "../use-manju-jobs";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import {
  buildShotImagePrompt,
  gridLayoutDims,
  isBusyStatus,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";
import { assetRegistryName } from "../lib/asset-registry";
import { registerGridJob } from "../lib/grid-jobs";
import {
  buildGridStoryboardImagePrompt,
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../lib/prompt-builders";
import { ManjuStepActions } from "../manju-step-actions";
import type {
  ManjuHeaderGenerateAction,
  ManjuHeaderTools,
} from "../manju-header-slots";

function storyboardStatusLabel(shot: ManjuShotDraft, busy: boolean) {
  if (shot.storyboardStatus === "queued") return "排队中";
  if (busy) return "生成中";
  if (shot.storyboardStatus === "failed") return "失败";
  if (shot.storyboardStale) return "需重做";
  if (shot.storyboardImageUrl) return "已出图";
  return "待出图";
}

function SortableShotCard({
  project,
  shot,
  onEdit,
  onGenerate,
}: {
  project: ManjuProjectDraft;
  shot: ManjuShotDraft;
  onEdit: (id: string) => void;
  onGenerate: (shot: ManjuShotDraft) => void;
}) {
  const updateShot = useManjuStore((s) => s.updateShot);
  const removeShot = useManjuStore((s) => s.removeShot);
  const addShot = useManjuStore((s) => s.addShot);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: shot.id });
  const busy = isBusyStatus(shot.storyboardStatus);
  const waitLabel =
    shot.storyboardStatus === "queued"
      ? "排队中…"
      : busy
        ? "生成中…"
        : null;
  const epTitle = shot.episodeId
    ? (project.episodes.find((e) => e.id === shot.episodeId)?.title ?? null)
    : null;

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "manju-asset-card manju-asset-card--interactive",
        isDragging && "opacity-80",
      )}
      role="button"
      tabIndex={0}
      onClick={() => onEdit(shot.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(shot.id);
        }
      }}
    >
      <div
        className="manju-asset-card__media"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            "manju-asset-card__tag",
            shot.storyboardStatus === "failed" && "is-failed",
            shot.storyboardImageUrl &&
              !shot.storyboardStale &&
              !busy &&
              "is-ok",
            (busy || shot.storyboardStale) && "is-busy",
          )}
        >
          {storyboardStatusLabel(shot, busy)}
        </span>
        {shot.storyboardImageUrl ? (
          <PhotoView src={shot.storyboardImageUrl}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.storyboardImageUrl}
              alt=""
              className="cursor-zoom-in"
            />
          </PhotoView>
        ) : !busy ? (
          <span className="text-xs text-muted-foreground">暂无分镜图</span>
        ) : null}
        {waitLabel ? (
          <div className="manju-asset-card__busy" aria-live="polite">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>{waitLabel}</span>
          </div>
        ) : null}
      </div>

      <div className="manju-asset-card__body">
        <div
          className="manju-asset-card__top"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <button
              type="button"
              className="manju-icon-btn cursor-grab active:cursor-grabbing"
              title="拖拽排序"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
            <h3 className="manju-asset-card__title">
              镜 {String(shot.index).padStart(2, "0")}
            </h3>
          </div>
          <button
            type="button"
            className="manju-icon-btn"
            aria-label="编辑"
            onClick={() => onEdit(shot.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="manju-icon-btn" aria-label="更多">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() =>
                  addShot(project.id, shot.index, {
                    episodeId: shot.episodeId,
                  })
                }
              >
                在后方插入
              </DropdownMenuItem>
              {project.episodes.length > 0 ? (
                <>
                  {project.episodes.map((ep) => (
                    <DropdownMenuItem
                      key={ep.id}
                      disabled={shot.episodeId === ep.id}
                      onClick={() =>
                        updateShot(project.id, shot.id, { episodeId: ep.id })
                      }
                    >
                      归入「{ep.title}」
                    </DropdownMenuItem>
                  ))}
                  {shot.episodeId ? (
                    <DropdownMenuItem
                      onClick={() =>
                        updateShot(project.id, shot.id, { episodeId: null })
                      }
                    >
                      清除分集归属
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => removeShot(project.id, shot.id)}
              >
                <Trash2 className="h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <button
          type="button"
          className="manju-asset-card__desc-text"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(shot.id);
          }}
        >
          {shot.visual.trim() || (
            <span className="opacity-50">点击填写画面描述…</span>
          )}
          {shot.dialogue.trim() ? (
            <span className="mt-1 block opacity-80">对白：{shot.dialogue}</span>
          ) : null}
        </button>

        {epTitle ? (
          <p className="manju-asset-card__alias-text">分集：{epTitle}</p>
        ) : null}

        <p className="manju-asset-card__prompt">
          {shot.imagePrompt?.trim() || shot.videoPrompt?.trim()
            ? [
                shot.imagePrompt?.trim()
                  ? `图：${shot.imagePrompt}`
                  : null,
                shot.videoPrompt?.trim()
                  ? `视频：${shot.videoPrompt}`
                  : "缺视频提示词",
              ]
                .filter(Boolean)
                .join(" · ")
            : "尚未编写提示词，请切到「提示词」"}
        </p>

        <div
          className="manju-asset-card__footer"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="manju-asset-card__actions">
            {shot.assetRefs.length > 0 ? (
              <span className="truncate text-[10px] text-muted-foreground">
                {shot.assetRefs
                  .slice(0, 3)
                  .map((id) => project.assets.find((a) => a.id === id)?.name)
                  .filter(Boolean)
                  .join(" · ")}
                {shot.assetRefs.length > 3
                  ? ` +${shot.assetRefs.length - 3}`
                  : ""}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground opacity-50">
                未关联资产
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="manju-asset-card__action manju-asset-card__action--primary"
              disabled={
                busy || (!shot.visual.trim() && !shot.imagePrompt?.trim())
              }
              onClick={() => onGenerate(shot)}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {shot.storyboardStatus === "failed"
                ? "重试"
                : shot.storyboardImageUrl
                  ? "重生成"
                  : "生成"}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ShotEditDialog({
  project,
  shot,
  open,
  onClose,
}: {
  project: ManjuProjectDraft;
  shot: ManjuShotDraft | null;
  open: boolean;
  onClose: () => void;
}) {
  const updateShot = useManjuStore((s) => s.updateShot);
  if (!shot) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="manju-dialog max-w-lg gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>
            编辑分镜 {String(shot.index).padStart(2, "0")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>画面描述</Label>
            <ManjuMdField
              value={shot.visual}
              onChange={(visual) =>
                updateShot(project.id, shot.id, { visual })
              }
              placeholder="画面描述…"
              height={120}
              hideToolbar
            />
          </div>
          <div className="space-y-1.5">
            <Label>对白（可选）</Label>
            <ManjuMdField
              value={shot.dialogue}
              onChange={(dialogue) =>
                updateShot(project.id, shot.id, { dialogue })
              }
              placeholder="对白…"
              height={72}
              hideToolbar
            />
          </div>
          {project.episodes.length > 0 ? (
            <div className="space-y-1.5">
              <Label>归属分集</Label>
              <Select
                value={shot.episodeId ?? "none"}
                onValueChange={(v) =>
                  updateShot(project.id, shot.id, {
                    episodeId: v === "none" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="未归属" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未归属</SelectItem>
                  {project.episodes.map((ep, i) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {String(i + 1).padStart(2, "0")} {ep.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {project.assets.length > 0 ? (
            <div className="space-y-1.5">
              <Label>关联资产</Label>
              <ManjuAssetPicker
                assets={project.assets}
                value={shot.assetRefs}
                onChange={(assetRefs) =>
                  updateShot(project.id, shot.id, { assetRefs })
                }
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StoryboardScriptStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const addShot = useManjuStore((s) => s.addShot);
  const updateShot = useManjuStore((s) => s.updateShot);
  const updateProject = useManjuStore((s) => s.updateProject);
  const setShots = useManjuStore((s) => s.setShots);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);
  const bindJobToShotStoryboard = useManjuStore(
    (s) => s.bindJobToShotStoryboard,
  );
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);
  const flushSave = useManjuStore((s) => s.flushSave);
  const analyzing = useManjuStore((s) => Boolean(s.analyzingIds[project.id]));
  const [editingId, setEditingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;
  const hasImages = visibleShots.some((s) => s.storyboardImageUrl);
  const shotBusy = visibleShots.some((s) => isBusyStatus(s.storyboardStatus));
  const staleCount = visibleShots.filter((s) => s.storyboardStale).length;

  const planShots = async () => {
    if (project.scriptText.trim().length < 20) {
      toast.error("请先在剧本编辑里写好原文");
      return;
    }
    if (episodeId) {
      const ep = project.episodes.find((e) => e.id === episodeId);
      if (!ep?.sourceText?.trim() && !project.scriptText.trim()) {
        toast.error("本集还没有原文片段，请先在剧本页规划分集");
        return;
      }
    }
    const scoped = episodeId
      ? project.shots.filter((s) => s.episodeId === episodeId)
      : project.shots;
    const hasMedia = scoped.some((s) => s.storyboardImageUrl || s.videoUrl);
    if (hasMedia) {
      const ok = await confirmDialog({
        title: episodeId ? "重新规划本集分镜？" : "重新规划分镜？",
        description: episodeId
          ? "只会合并当前分集的镜头，其他集的图和视频会保留。"
          : "规划会按镜号合并画面和对白，已有分镜图和视频会尽量保留。",
        confirmText: "继续规划",
        cancelText: "取消",
      });
      if (!ok) return;
    }
    try {
      setAnalyzing(project.id, true);
      await flushSave(project.id);
      await submitWorkflowSkill({
        project,
        skill: "script_plan",
        episodeId,
      });
      toast.success(episodeId ? "已提交本集分镜规划" : "已提交分镜规划");
    } catch (e) {
      setAnalyzing(project.id, false);
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const confirmScript = () => {
    if (project.shots.length === 0) {
      toast.error("请先规划或新增分镜");
      return;
    }
    updateProject(project.id, { scriptConfirmed: true });
    toast.success("脚本已确认，可以编写提示词");
  };

  const generateStoryboard = async (shot: ManjuShotDraft) => {
    if (!shot.visual.trim() && !shot.imagePrompt?.trim()) {
      toast.error("请先填写画面描述或画面提示词");
      return;
    }
    if (project.settings.mode === "grid") {
      toast.message("多宫格模式请用「全部生成」按批出图切块");
      return;
    }
    try {
      const slots = resolveShotReferenceSlots(shot, project);
      const { referenceAssetIds, referenceUrls } =
        referenceMediaFromSlots(slots);
      const job = await submitImageJob({
        prompt: buildShotImagePrompt(shot, project),
        ratio: project.settings.ratio,
        modelId: project.settings.imageModelId,
        manjuProjectId: project.id,
        referenceAssetIds,
        referenceUrls,
      });
      bindJobToShotStoryboard(project.id, shot.id, job.id, "queued");
      toast.success(`分镜 ${String(shot.index).padStart(2, "0")} 已提交生图`);
    } catch (e) {
      updateShot(project.id, shot.id, { storyboardStatus: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const generateGridBatches = async (targets: ManjuShotDraft[]) => {
    const layout = project.settings.gridLayout === "3x3" ? "3x3" : "2x2";
    const { rows, cols, cells } = gridLayoutDims(layout);
    const ready = targets.filter(
      (s) => s.visual.trim() || s.imagePrompt?.trim(),
    );
    if (ready.length === 0) {
      toast.message("没有可生成的分镜");
      return;
    }
    for (let i = 0; i < ready.length; i += cells) {
      const batch = ready.slice(i, i + cells);
      const groupId = crypto.randomUUID();
      const assetIds = new Set(batch.flatMap((s) => s.assetRefs));
      const linked = project.assets.filter(
        (a) => assetIds.has(a.id) && (a.assetId || a.imageUrl),
      );
      const referenceAssetIds = linked
        .map((a) => a.assetId)
        .filter((id): id is string => Boolean(id));
      const referenceUrls = linked
        .filter((a) => !a.assetId && a.imageUrl)
        .map((a) => a.imageUrl!)
        .filter(Boolean);
      try {
        for (const shot of batch) {
          updateShot(project.id, shot.id, {
            storyboardStatus: "queued",
            gridGroupId: groupId,
            gridCellIndex: batch.indexOf(shot),
          });
        }
        const job = await submitImageJob({
          prompt: buildGridStoryboardImagePrompt(batch, project, layout),
          ratio: project.settings.ratio,
          modelId: project.settings.imageModelId,
          manjuProjectId: project.id,
          referenceAssetIds: referenceAssetIds.length
            ? referenceAssetIds
            : undefined,
          referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        });
        registerGridJob(job.id, {
          projectId: project.id,
          shotIds: batch.map((s) => s.id),
          rows,
          cols,
        });
        for (const shot of batch) {
          bindJobToShotStoryboard(project.id, shot.id, job.id, "queued");
        }
        toast.success(
          `已提交 ${layout} 宫格（${batch.length} 镜），完成后自动切块`,
        );
      } catch (e) {
        for (const shot of batch) {
          updateShot(project.id, shot.id, { storyboardStatus: "failed" });
        }
        toast.error(e instanceof Error ? e.message : "宫格提交失败");
      }
    }
  };

  const generateAll = async (force = false) => {
    const targets = visibleShots.filter(
      (s) =>
        (force || !s.storyboardImageUrl || s.storyboardStale) &&
        (s.visual.trim() || s.imagePrompt?.trim()) &&
        !isBusyStatus(s.storyboardStatus),
    );
    if (targets.length === 0) {
      toast.message(
        force
          ? "没有可重新生成的分镜"
          : "没有待生成的分镜（已跳过未过期的图）",
      );
      return;
    }
    if (project.settings.mode === "grid") {
      await generateGridBatches(targets);
      return;
    }
    for (const shot of targets) {
      await generateStoryboard(shot);
    }
  };

  const generateStaleOnly = async () => {
    const targets = visibleShots.filter(
      (s) =>
        s.storyboardStale &&
        (s.visual.trim() || s.imagePrompt?.trim()) &&
        !isBusyStatus(s.storyboardStatus),
    );
    if (targets.length === 0) {
      toast.message("没有标记为过期的分镜图");
      return;
    }
    if (project.settings.mode === "grid") {
      await generateGridBatches(targets);
      return;
    }
    for (const shot of targets) {
      await generateStoryboard(shot);
    }
  };

  const needsPlan = visibleShots.length === 0;
  const needsConfirm = visibleShots.length > 0 && !project.scriptConfirmed;
  const needsPrompts =
    project.scriptConfirmed &&
    visibleShots.some(
      (s) => !s.imagePrompt?.trim() || !s.videoPrompt?.trim(),
    );
  const canGenerateImages =
    project.scriptConfirmed && !needsPrompts && visibleShots.length > 0;

  const stepTools: ManjuHeaderTools = {
    add: {
      label: "新增",
      onClick: () => {
        const id = addShot(project.id, undefined, {
          episodeId: episodeId ?? null,
        });
        setEditingId(id);
      },
    },
    secondary: {
      label: episodeId ? "规划本集" : "规划分镜",
      onClick: () => void planShots(),
      disabled: analyzing || project.scriptText.trim().length < 20,
      loading: analyzing,
      focus: "plan",
      emphasis: needsPlan,
      title: needsPlan
        ? "先用 AI 按剧本拆镜头"
        : "可重新规划；已有分镜图会尽量保留",
    },
    tertiary: needsConfirm
      ? {
          label: "确认脚本",
          onClick: confirmScript,
          focus: "confirm",
          emphasis: true,
          title: "确认后才能写提示词、生成分镜图",
        }
      : staleCount && canGenerateImages
        ? {
            label: `重做过期(${staleCount})`,
            onClick: () => void generateStaleOnly(),
          }
        : undefined,
  };

  const generateBlockedReason = needsPlan
    ? "先规划或新增分镜"
    : needsConfirm
      ? "请先点「确认脚本」"
      : needsPrompts
        ? "请先到「提示词」页编写提示词"
        : analyzing
          ? "规划中，请稍候"
          : undefined;

  const stepGenerate: ManjuHeaderGenerateAction = {
    label: hasImages ? "重新生成" : "开始生成",
    onPrimary: () => void generateAll(hasImages),
    disabled: !canGenerateImages || analyzing,
    loading: shotBusy,
    emphasis: canGenerateImages && !hasImages,
    title: generateBlockedReason,
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleShots.findIndex((s) => s.id === active.id);
    const newIndex = visibleShots.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const moved = arrayMove(visibleShots, oldIndex, newIndex);
    if (!episodeId) {
      setShots(project.id, moved, { preserveConfirm: true });
      return;
    }
    const queue = [...moved];
    setShots(
      project.id,
      project.shots.map((s) =>
        s.episodeId === episodeId ? (queue.shift() ?? s) : s,
      ),
      { preserveConfirm: true },
    );
  };

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="manju-step-bar">
          <p className="text-sm text-muted-foreground">
            共 {visibleShots.length} 个分镜
            {visibleShots.filter((s) => s.storyboardImageUrl).length > 0
              ? ` · 已出图 ${visibleShots.filter((s) => s.storyboardImageUrl).length}`
              : ""}
            {project.settings.mode === "grid"
              ? ` · 多宫格 ${project.settings.gridLayout === "3x3" ? "3×3" : "2×2"}（全部生成按批切块）`
              : ""}
            <span className="ml-2 opacity-70">· 拖拽手柄排序</span>
            {project.scriptConfirmed ? (
              <span className="ml-2 opacity-70">· 脚本已确认</span>
            ) : null}
          </p>
          <ManjuStepActions
            tools={stepTools}
            generate={stepGenerate}
            busy={shotBusy}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="manju-list__pill"
            onClick={() => {
              autoLinkShotAssets(project.id);
              toast.success("已按名称自动关联资产");
            }}
            disabled={
              visibleShots.length === 0 || project.assets.length === 0
            }
          >
            <Link2 className="size-3.5" />
            关联资产
          </button>
        </div>

        {visibleShots.length === 0 ? (
          <div className="manju-assets-empty">
            <p className="manju-assets-empty__title">
              {episodeId ? "这一集还没有镜头" : "还没有分镜"}
            </p>
            <div className="manju-assets-empty__actions">
              <button
                type="button"
                className="manju-entry-card manju-entry-card--compact"
                data-manju-focus="plan"
                disabled={analyzing || project.scriptText.trim().length < 20}
                onClick={() => void planShots()}
              >
                <strong>
                  {analyzing
                    ? "规划中…"
                    : `AI ${episodeId ? "规划本集" : "规划分镜"}`}
                </strong>
              </button>
              <button
                type="button"
                className="manju-entry-card manju-entry-card--compact"
                onClick={() => {
                  const id = addShot(project.id, undefined, {
                    episodeId: episodeId ?? null,
                  });
                  setEditingId(id);
                }}
              >
                <strong>{episodeId ? "为本集新增" : "新增分镜"}</strong>
              </button>
            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={visibleShots.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className="manju-shot-grid">
                {visibleShots.map((shot) => (
                  <SortableShotCard
                    key={shot.id}
                    project={project}
                    shot={shot}
                    onEdit={setEditingId}
                    onGenerate={(s) => void generateStoryboard(s)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <ShotEditDialog
        project={project}
        shot={
          editingId
            ? (project.shots.find((s) => s.id === editingId) ?? null)
            : null
        }
        open={Boolean(editingId)}
        onClose={() => setEditingId(null)}
      />
    </JoyPhotoProvider>
  );
}
