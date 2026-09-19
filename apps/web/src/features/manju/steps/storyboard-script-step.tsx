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
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { useManjuStore } from "../manju-store";
import { submitImageJob } from "../use-manju-jobs";
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
                onClick={() => addShot(project.id, shot.index)}
              >
                在后方插入
              </DropdownMenuItem>
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
          <Textarea
            value={shot.visual}
            onChange={(e) =>
              updateShot(project.id, shot.id, { visual: e.target.value })
            }
            placeholder="画面描述…"
            className="min-h-[88px] text-xs"
            autoFocus
          />
          <Textarea
            value={shot.dialogue}
            onChange={(e) =>
              updateShot(project.id, shot.id, { dialogue: e.target.value })
            }
            placeholder="对白（可选）"
            className="min-h-[52px] text-xs"
          />
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
                <p className="text-amber-400/80">缺视频提示词</p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-amber-400/80">
              尚未编写提示词 → 左侧「提示词」面板
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
}: {
  project: ManjuProjectDraft;
}) {
  const addShot = useManjuStore((s) => s.addShot);
  const updateShot = useManjuStore((s) => s.updateShot);
  const setShots = useManjuStore((s) => s.setShots);
  const autoLinkShotAssets = useManjuStore((s) => s.autoLinkShotAssets);
  const bindJobToShotStoryboard = useManjuStore(
    (s) => s.bindJobToShotStoryboard,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

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
    const targets = project.shots.filter(
      (s) =>
        (s.visual.trim() || s.imagePrompt?.trim()) &&
        !isBusyStatus(s.storyboardStatus),
    );
    if (targets.length === 0) {
      toast.message("没有可生成的分镜");
      return;
    }
    for (const shot of targets) {
      await generateStoryboard(shot);
    }
  };

  const fromScript = () => {
    const shots = parseScriptToShots(project.scriptText);
    if (shots.length === 0) {
      toast.error("剧本为空或无法拆分");
      return;
    }
    setShots(project.id, shots);
    autoLinkShotAssets(project.id);
    toast.success(`已从剧本写入 ${shots.length} 个分镜`);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = project.shots.findIndex((s) => s.id === active.id);
    const newIndex = project.shots.findIndex((s) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setShots(project.id, arrayMove(project.shots, oldIndex, newIndex));
  };

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            共 {project.shots.length} 个分镜
            {project.shots.filter((s) => s.storyboardImageUrl).length > 0
              ? ` · 已出图 ${project.shots.filter((s) => s.storyboardImageUrl).length}`
              : ""}
            <span className="ml-2 opacity-70">· 拖拽手柄排序</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/manju/${project.id}?panel=prompts`}>
                <PenLine className="h-4 w-4" />
                提示词
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fromScript}
              disabled={!project.scriptText.trim()}
            >
              从剧本同步
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                autoLinkShotAssets(project.id);
                toast.success("已按名称自动关联资产");
              }}
              disabled={
                project.shots.length === 0 || project.assets.length === 0
              }
            >
              <Link2 className="h-4 w-4" />
              关联资产
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void generateAll()}
              disabled={project.shots.length === 0}
            >
              <Sparkles className="h-4 w-4" />
              全部生成分镜图
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const id = addShot(project.id);
                setEditingId(id);
              }}
            >
              <Plus className="h-4 w-4" />
              新增
            </Button>
          </div>
        </div>

        {project.shots.length === 0 ? (
          <div className="manju-card text-center">
            <p className="manju-card__desc mb-4">
              还没有分镜。可从剧本同步，或手动新增镜头卡。
            </p>
            <Button size="sm" onClick={() => addShot(project.id)}>
              <Plus className="h-4 w-4" />
              新增分镜
            </Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={project.shots.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className="manju-shot-grid">
                {project.shots.map((shot) => (
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
