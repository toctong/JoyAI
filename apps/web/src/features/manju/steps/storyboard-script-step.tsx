"use client";

import { useState } from "react";
import Link from "next/link";
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
  PenLine,
  Plus,
  Sparkles,
  Trash2,
  Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useManjuStore } from "../manju-store";
import { submitImageJob } from "../use-manju-jobs";
import { submitWorkflowSkill } from "../lib/workflow-skill";
import {
  buildShotImagePrompt,
  isBusyStatus,
  parseScriptToShots,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";
import {
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../lib/prompt-builders";

function SortableShotCard({
  project,
  shot,
  editing,
  onEdit,
  onGenerate,
}: {
  project: ManjuProjectDraft;
  shot: ManjuShotDraft;
  editing: boolean;
  onEdit: (id: string | null) => void;
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

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn("manju-shot-card", isDragging && "opacity-80 shadow-lg")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="manju-icon-btn cursor-grab active:cursor-grabbing"
            title="拖拽排序"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="manju-shot-card__index !mb-0">
            {String(shot.index).padStart(2, "0")}
          </span>
          {shot.storyboardStale ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
              图需重做
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="manju-icon-btn"
            disabled={busy || (!shot.visual.trim() && !shot.imagePrompt?.trim())}
            title="生成分镜图"
            onClick={() => onGenerate(shot)}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="manju-icon-btn">
                <MoreHorizontal className="h-4 w-4" />
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
      </div>

      {shot.storyboardImageUrl ? (
        <PhotoView src={shot.storyboardImageUrl}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shot.storyboardImageUrl}
            alt=""
            className="manju-shot-card__thumb cursor-zoom-in"
          />
        </PhotoView>
      ) : busy ? (
        <div className="manju-shot-card__thumb manju-shot-card__thumb--empty">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : null}

      {editing ? (
        <div className="mt-2 space-y-2">
          <ManjuMdField
            value={shot.visual}
            onChange={(visual) =>
              updateShot(project.id, shot.id, { visual })
            }
            placeholder="画面描述…"
            height={100}
            hideToolbar
          />
          <ManjuMdField
            value={shot.dialogue}
            onChange={(dialogue) =>
              updateShot(project.id, shot.id, { dialogue })
            }
            placeholder="对白（可选）"
            height={72}
            hideToolbar
            className="mt-2"
          />
          {project.episodes.length > 0 ? (
            <p className="text-[10px] text-muted-foreground">
              分集：
              {project.episodes.find((e) => e.id === shot.episodeId)?.title ??
                "未归属"}
            </p>
          ) : null}
          {project.assets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {project.assets.map((a) => {
                const on = shot.assetRefs.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className={cn(
                      "manju-chip !px-2 !py-0.5 !text-[11px]",
                      on && "manju-chip--active",
                    )}
                    onClick={() => {
                      const next = on
                        ? shot.assetRefs.filter((id) => id !== a.id)
                        : [...shot.assetRefs, a.id];
                      updateShot(project.id, shot.id, { assetRefs: next });
                    }}
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => onEdit(null)}>
            完成编辑
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-2 w-full text-left"
          onClick={() => onEdit(shot.id)}
        >
          <div className="manju-shot-card__text">
            {shot.visual || (
              <span className="text-muted-foreground">点击填写画面描述…</span>
            )}
            {shot.dialogue ? `\n\n${shot.dialogue}` : ""}
          </div>
          {shot.imagePrompt?.trim() || shot.videoPrompt?.trim() ? (
            <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
              {shot.imagePrompt?.trim() ? (
                <p className="line-clamp-2">图：{shot.imagePrompt}</p>
              ) : null}
              {shot.videoPrompt?.trim() ? (
                <p className="line-clamp-2">视频：{shot.videoPrompt}</p>
              ) : (
                <p className="text-amber-600/90 dark:text-amber-400/80">缺视频提示词</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-amber-600/90 dark:text-amber-400/80">
              尚未编写提示词，请切到上方「提示词」
            </p>
          )}
          {shot.assetRefs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {shot.assetRefs.map((id) => {
                const a = project.assets.find((x) => x.id === id);
                return a ? (
                  <span
                    key={id}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {a.name}
                  </span>
                ) : null;
              })}
            </div>
          ) : null}
        </button>
      )}
    </article>
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
    try {
      const slots = resolveShotReferenceSlots(shot, project);
      const { referenceAssetIds, referenceUrls } =
        referenceMediaFromSlots(slots);
      const job = await submitImageJob({
        prompt: buildShotImagePrompt(shot, project),
        ratio: project.settings.ratio,
        modelId: project.settings.imageModelId,
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

  const generateAll = async () => {
    const targets = visibleShots.filter(
      (s) =>
        (!s.storyboardImageUrl || s.storyboardStale) &&
        (s.visual.trim() || s.imagePrompt?.trim()) &&
        !isBusyStatus(s.storyboardStatus),
    );
    if (targets.length === 0) {
      toast.message("没有待生成的分镜（已跳过未过期的图）");
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
    for (const shot of targets) {
      await generateStoryboard(shot);
    }
  };

  const fromScript = async () => {
    const shots = parseScriptToShots(project.scriptText);
    if (shots.length === 0) {
      toast.error("剧本为空或无法拆分");
      return;
    }
    const hasMedia = project.shots.some(
      (s) => s.storyboardImageUrl || s.videoUrl,
    );
    if (hasMedia) {
      const ok = await confirmDialog({
        title: "覆盖现有分镜？",
        description:
          "当前分镜已有分镜图或视频。从剧本同步会整表替换镜头列表，已有媒体可能丢失。",
        confirmText: "仍然同步",
        cancelText: "取消",
        destructive: true,
      });
      if (!ok) return;
    }
    setShots(project.id, shots);
    autoLinkShotAssets(project.id);
    toast.success(`已从剧本写入 ${shots.length} 个分镜`);
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            共 {visibleShots.length} 个分镜
            {visibleShots.filter((s) => s.storyboardImageUrl).length > 0
              ? ` · 已出图 ${visibleShots.filter((s) => s.storyboardImageUrl).length}`
              : ""}
            <span className="ml-2 opacity-70">· 拖拽手柄排序</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/manju/${project.id}?step=storyboard-script&view=prompts`}>
                <PenLine className="h-4 w-4" />
                提示词
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fromScript()}
              disabled={!project.scriptText.trim() || analyzing}
            >
              从剧本同步
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={analyzing || project.scriptText.trim().length < 20}
              onClick={() => void planShots()}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              AI {episodeId ? "规划本集" : "规划分镜"}
            </Button>
            {project.shots.length > 0 && !project.scriptConfirmed ? (
              <Button variant="outline" size="sm" onClick={confirmScript}>
                确认脚本
              </Button>
            ) : project.scriptConfirmed ? (
              <span className="self-center text-xs text-muted-foreground">
                脚本已确认
              </span>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                autoLinkShotAssets(project.id);
                toast.success("已按名称自动关联资产");
              }}
              disabled={
                visibleShots.length === 0 || project.assets.length === 0
              }
            >
              <Link2 className="h-4 w-4" />
              关联资产
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void generateAll()}
              disabled={visibleShots.length === 0}
            >
              <Sparkles className="h-4 w-4" />
              全部生成分镜图
            </Button>
            {visibleShots.some((s) => s.storyboardStale) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void generateStaleOnly()}
              >
                重做过期图 (
                {visibleShots.filter((s) => s.storyboardStale).length})
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => {
                const id = addShot(project.id, undefined, {
                  episodeId: episodeId ?? null,
                });
                setEditingId(id);
              }}
            >
              <Plus className="h-4 w-4" />
              新增
            </Button>
          </div>
        </div>

        {visibleShots.length === 0 ? (
          <div className="manju-card text-center">
            <p className="manju-card__desc mb-4">
              {episodeId
                ? "这一集还没有镜头。可切回全部镜头，或用 AI 规划分镜。"
                : "还没有分镜。可用 AI 按剧本规划，或手动新增镜头卡。"}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                disabled={analyzing || project.scriptText.trim().length < 20}
                onClick={() => void planShots()}
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                AI {episodeId ? "规划本集" : "规划分镜"}
              </Button>
            {!episodeId ? (
              <Button size="sm" onClick={() => addShot(project.id)}>
                <Plus className="h-4 w-4" />
                新增分镜
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  const id = addShot(project.id, undefined, { episodeId });
                  setEditingId(id);
                }}
              >
                <Plus className="h-4 w-4" />
                为本集新增
              </Button>
            )}
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
                    editing={editingId === shot.id}
                    onEdit={setEditingId}
                    onGenerate={(s) => void generateStoryboard(s)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </JoyPhotoProvider>
  );
}
