"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { submitVideoJob } from "../use-manju-jobs";
import {
  buildShotVideoPrompt,
  isBusyStatus,
  resolveManjuGenMode,
  shotDurationSeconds,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";
import {
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../lib/prompt-builders";
import { ManjuStepActions } from "../manju-step-actions";
import type {
  ManjuHeaderGenerateAction,
  ManjuHeaderTools,
} from "../manju-header-slots";

const DURATION_OPTS = [4, 5, 8, 10] as const;

function videoStatusLabel(shot: ManjuShotDraft, busy: boolean) {
  if (shot.videoStatus === "queued") return "排队中";
  if (busy) return "生成中";
  if (shot.videoStatus === "failed") return "失败";
  if (shot.videoStale) return "需重做";
  if (shot.videoUrl) return "已出片";
  return "待出片";
}

export function StoryboardVideoStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const router = useRouter();
  const updateShot = useManjuStore((s) => s.updateShot);
  const bindJobToShotVideo = useManjuStore((s) => s.bindJobToShotVideo);
  const addShot = useManjuStore((s) => s.addShot);
  const [editingId, setEditingId] = useState<string | null>(null);

  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;
  const hasVideos = visibleShots.some((s) => s.videoUrl);
  const videoBusy = visibleShots.some((s) => isBusyStatus(s.videoStatus));
  const staleCount = visibleShots.filter((s) => s.videoStale).length;
  const missingCount = visibleShots.filter(
    (s) => !s.videoUrl && !isBusyStatus(s.videoStatus),
  ).length;
  const editing = editingId
    ? (project.shots.find((s) => s.id === editingId) ?? null)
    : null;

  const prevShotMedia = (shot: ManjuShotDraft) => {
    const idx = project.shots.findIndex((s) => s.id === shot.id);
    if (idx <= 0) return null;
    return project.shots[idx - 1] ?? null;
  };

  const generateVideo = async (shot: ManjuShotDraft) => {
    if (
      !shot.visual.trim() &&
      !shot.storyboardImageUrl &&
      !shot.videoPrompt?.trim()
    ) {
      toast.error("请先完成分镜描述、提示词或分镜图");
      return;
    }
    try {
      const mode = resolveManjuGenMode(project.settings.mode);
      const slots = resolveShotReferenceSlots(shot, project);
      const fromAssets = referenceMediaFromSlots(slots);
      const prev = prevShotMedia(shot);

      let referenceAssetIds: string[] = [];
      let referenceUrls: string[] = [];
      let continuityHint: string | null = null;

      if (mode === "ref") {
        referenceAssetIds = fromAssets.referenceAssetIds;
        referenceUrls = fromAssets.referenceUrls;
      } else {
        // i2v: 首帧 = 上一镜分镜（没有则本镜），末帧 = 本镜分镜
        const pushRef = (
          assetId: string | null | undefined,
          url: string | null | undefined,
        ) => {
          if (assetId) referenceAssetIds.push(assetId);
          else if (url) referenceUrls.push(url);
        };
        const prevAsset = prev?.storyboardAssetId;
        const prevUrl = prev?.storyboardImageUrl;
        const hasPrevFrame = Boolean(prevAsset || prevUrl);
        const sameAsCurrent =
          (prevAsset && prevAsset === shot.storyboardAssetId) ||
          (prevUrl && prevUrl === shot.storyboardImageUrl);
        if (hasPrevFrame && !sameAsCurrent) {
          pushRef(prevAsset, prevUrl);
          continuityHint =
            "首帧承接上一镜分镜静帧，末帧落到本镜构图，动作连续过渡，不要硬切。";
        }
        pushRef(shot.storyboardAssetId, shot.storyboardImageUrl);
      }

      if (mode === "i2v" && !shot.storyboardImageUrl) {
        toast.error("图生视频需要先有分镜静帧");
        return;
      }

      const duration = shotDurationSeconds(shot, project);
      const job = await submitVideoJob({
        prompt: buildShotVideoPrompt(shot, project, {
          continuityHint,
          mode,
        }),
        duration,
        ratio: project.settings.ratio,
        referenceAssetIds: referenceAssetIds.length
          ? referenceAssetIds
          : undefined,
        referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        refMode: mode === "ref" ? "omni" : "first_last",
        modelId: project.settings.videoModelId || undefined,
        manjuProjectId: project.id,
      });
      bindJobToShotVideo(project.id, shot.id, job.id, "queued");
      toast.success(`镜头 ${String(shot.index).padStart(2, "0")} 已提交生视频`);
    } catch (e) {
      updateShot(project.id, shot.id, { videoStatus: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const generateAll = async (force = false) => {
    const mode = resolveManjuGenMode(project.settings.mode);
    let targets = visibleShots.filter(
      (s) =>
        (force || !s.videoUrl || s.videoStale) &&
        (s.visual.trim() || s.storyboardImageUrl || s.videoPrompt?.trim()) &&
        !isBusyStatus(s.videoStatus),
    );
    if (mode === "i2v") {
      const skipped = targets.filter((s) => !s.storyboardImageUrl).length;
      targets = targets.filter((s) => s.storyboardImageUrl);
      if (skipped > 0) {
        toast.message(`已跳过 ${skipped} 镜：图生视频需要分镜静帧`);
      }
    }
    if (targets.length === 0) {
      toast.message(
        force
          ? "没有可重新生成的镜头"
          : "没有待生成的镜头（已跳过未过期视频或缺分镜图）",
      );
      return;
    }
    for (const shot of targets) {
      await generateVideo(shot);
    }
  };

  const generateStaleOnly = async () => {
    const mode = resolveManjuGenMode(project.settings.mode);
    let targets = visibleShots.filter(
      (s) =>
        s.videoStale &&
        (s.visual.trim() || s.storyboardImageUrl || s.videoPrompt?.trim()) &&
        !isBusyStatus(s.videoStatus),
    );
    if (mode === "i2v") {
      const skipped = targets.filter((s) => !s.storyboardImageUrl).length;
      targets = targets.filter((s) => s.storyboardImageUrl);
      if (skipped > 0) {
        toast.message(`已跳过 ${skipped} 镜：图生视频需要分镜静帧`);
      }
    }
    if (targets.length === 0) {
      toast.message("没有可重做的过期视频（或缺分镜图）");
      return;
    }
    for (const shot of targets) {
      await generateVideo(shot);
    }
  };

  const stepTools: ManjuHeaderTools = {
    add: {
      label: "新增镜头",
      onClick: () =>
        addShot(project.id, undefined, { episodeId: episodeId ?? null }),
    },
    secondary:
      missingCount > 0
        ? {
            label: `补缺(${missingCount})`,
            onClick: () => void generateAll(),
          }
        : undefined,
    tertiary: staleCount
      ? {
          label: `重做过期(${staleCount})`,
          onClick: () => void generateStaleOnly(),
        }
      : undefined,
  };

  const stepGenerate: ManjuHeaderGenerateAction = {
    label: hasVideos ? "重新生成" : "开始生成",
    onPrimary: () => void generateAll(hasVideos),
    onOpenSettings: () =>
      router.replace(`/manju/${project.id}?step=video-settings`),
    disabled: visibleShots.length === 0,
    loading: videoBusy,
    emphasis: visibleShots.length > 0 && !hasVideos,
    title:
      visibleShots.length === 0
        ? "请先在分镜脚本里建镜头"
        : hasVideos
          ? "可批量重出镜头视频"
          : "点这里批量出镜头视频",
  };

  if (visibleShots.length === 0) {
    return (
      <div className="manju-panel">
        <ManjuStepActions tools={stepTools} generate={stepGenerate} />
        <div className="manju-card">
          <div className="manju-card__title">分镜视频</div>
          <p className="manju-card__desc">
            尚无分镜。请先在「分镜脚本」中创建镜头卡。
          </p>
        </div>
      </div>
    );
  }

  const done = visibleShots.filter((s) => s.videoUrl).length;

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="manju-step-bar">
          <p className="text-sm text-muted-foreground">
            共 {visibleShots.length} 镜 · 已完成 {done} · 模式{" "}
            {project.settings.mode === "ref"
              ? "全能参考"
              : project.settings.mode === "grid"
                ? `多宫格→逐格视频（${project.settings.gridLayout === "3x3" ? "3×3" : "2×2"}）`
                : "图生视频"}
            · 批量会重做过期项；缺分镜静帧会跳过
          </p>
          <ManjuStepActions
            tools={stepTools}
            generate={stepGenerate}
            busy={videoBusy}
          />
        </div>

        <div className="manju-shot-grid">
          {visibleShots.map((shot) => {
            const busy = isBusyStatus(shot.videoStatus);
            const dur = shotDurationSeconds(shot, project);
            const waitLabel =
              shot.videoStatus === "queued"
                ? "排队中…"
                : busy
                  ? "生成中…"
                  : null;
            return (
              <article
                key={shot.id}
                className="manju-asset-card manju-asset-card--interactive"
                role="button"
                tabIndex={0}
                onClick={() => setEditingId(shot.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingId(shot.id);
                  }
                }}
              >
                <div
                  className="manju-asset-card__media"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    className={cn(
                      "manju-asset-card__tag",
                      shot.videoStatus === "failed" && "is-failed",
                      shot.videoUrl && !shot.videoStale && !busy && "is-ok",
                      (busy || shot.videoStale) && "is-busy",
                    )}
                  >
                    {videoStatusLabel(shot, busy)}
                  </span>
                  {shot.videoUrl ? (
                    <StudioPlyrPlayer
                      src={shot.videoUrl}
                      poster={shot.storyboardImageUrl}
                      className="h-full w-full"
                    />
                  ) : shot.storyboardImageUrl ? (
                    <PhotoView src={shot.storyboardImageUrl}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.storyboardImageUrl}
                        alt=""
                        className="cursor-zoom-in opacity-80"
                      />
                    </PhotoView>
                  ) : !busy ? (
                    <span className="text-xs text-muted-foreground">
                      暂无视频
                    </span>
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
                    <h3 className="manju-asset-card__title">
                      镜 {String(shot.index).padStart(2, "0")}
                    </h3>
                    <button
                      type="button"
                      className="manju-icon-btn"
                      aria-label="编辑"
                      onClick={() => setEditingId(shot.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <button
                    type="button"
                    className="manju-asset-card__desc-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(shot.id);
                    }}
                  >
                    {shot.visual.trim() || (
                      <span className="opacity-50">（无画面描述）</span>
                    )}
                  </button>

                  <p className="manju-asset-card__alias-text">时长 {dur}s</p>

                  <p className="manju-asset-card__prompt">
                    {shot.videoPrompt?.trim()
                      ? `提示词：${shot.videoPrompt}`
                      : "未写视频提示词，将用画面描述拼装"}
                  </p>

                  <div
                    className="manju-asset-card__footer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="manju-asset-card__actions">
                      <Button
                        variant="outline"
                        size="sm"
                        className="manju-asset-card__action manju-asset-card__action--primary"
                        disabled={busy}
                        onClick={() => void generateVideo(shot)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Video className="h-3.5 w-3.5" />
                        )}
                        {shot.videoUrl
                          ? shot.videoStale
                            ? "重做过期"
                            : "重生成"
                          : shot.videoStatus === "failed"
                            ? "重试"
                            : "生成"}
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
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="manju-dialog max-w-lg gap-4 border-border bg-card p-5 shadow-none sm:rounded-xl">
          {editing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  编辑镜头视频 {String(editing.index).padStart(2, "0")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>本镜时长</Label>
                  <div className="manju-chip-row">
                    {DURATION_OPTS.map((d) => {
                      const dur = shotDurationSeconds(editing, project);
                      return (
                        <button
                          key={d}
                          type="button"
                          className={cn(
                            "manju-chip",
                            dur === d && "manju-chip--active",
                          )}
                          onClick={() =>
                            updateShot(project.id, editing.id, {
                              duration:
                                d === project.settings.duration ? null : d,
                            })
                          }
                        >
                          {d}s
                        </button>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {editing.visual.trim() || "（无画面描述）"}
                </p>
                {editing.videoPrompt?.trim() ? (
                  <p className="text-xs text-muted-foreground">
                    提示词：{editing.videoPrompt}
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setEditingId(null)}>
                  完成
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </JoyPhotoProvider>
  );
}
