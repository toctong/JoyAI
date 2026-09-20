"use client";

import { useRouter } from "next/navigation";
import { Loader2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useRegisterManjuHeaderSlots } from "../manju-header-slots";

const DURATION_OPTS = [4, 5, 8, 10] as const;

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

  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;
  const hasVideos = visibleShots.some((s) => s.videoUrl);
  const videoBusy = visibleShots.some((s) => isBusyStatus(s.videoStatus));
  const staleCount = visibleShots.filter((s) => s.videoStale).length;
  const missingCount = visibleShots.filter(
    (s) => !s.videoUrl && !isBusyStatus(s.videoStatus),
  ).length;

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

  useRegisterManjuHeaderSlots(
    null,
    {
      label: hasVideos ? "重新生成" : "开始生成",
      onPrimary: () => void generateAll(hasVideos),
      onOpenSettings: () =>
        router.replace(`/manju/${project.id}?step=video-settings`),
      disabled: visibleShots.length === 0,
      loading: videoBusy,
    },
    {
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
    },
    `${episodeId ?? "all"}:${visibleShots.length}:${hasVideos}:${videoBusy}:${staleCount}:${missingCount}:${project.settings.mode}`,
  );

  if (visibleShots.length === 0) {
    return (
      <div className="manju-card">
        <div className="manju-card__title">分镜视频</div>
        <p className="manju-card__desc">
          尚无分镜。请先在「分镜脚本」中创建镜头卡。
        </p>
      </div>
    );
  }

  const done = visibleShots.filter((s) => s.videoUrl).length;

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            共 {visibleShots.length} 镜 · 已完成 {done} · 模式{" "}
            {project.settings.mode === "ref"
              ? "全能参考"
              : project.settings.mode === "grid"
                ? `多宫格→逐格视频（${project.settings.gridLayout === "3x3" ? "3×3" : "2×2"}）`
                : "图生视频"}
            · 批量会重做过期项；缺分镜静帧会跳过
          </p>
        </div>

        <div className="manju-shot-grid">
          {visibleShots.map((shot) => {
            const busy = isBusyStatus(shot.videoStatus);
            const dur = shotDurationSeconds(shot, project);
            return (
              <article key={shot.id} className="manju-shot-card">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="manju-shot-card__index !mb-0">
                    {String(shot.index).padStart(2, "0")}
                  </span>
                  {shot.videoStale ? (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                      视频需重做
                    </span>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
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

                <div className="manju-video-frame overflow-hidden rounded-md">
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
                        className="h-full w-full cursor-zoom-in object-cover opacity-70"
                      />
                    </PhotoView>
                  ) : busy ? (
                    <div className="flex flex-col items-center gap-2 py-10">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      生成中…
                    </div>
                  ) : (
                    <span className="text-xs">待生成视频</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {DURATION_OPTS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={cn(
                        "manju-chip !px-2 !py-0.5 !text-[11px]",
                        dur === d && "manju-chip--active",
                      )}
                      onClick={() =>
                        updateShot(project.id, shot.id, {
                          duration: d === project.settings.duration ? null : d,
                        })
                      }
                    >
                      {d}s
                    </button>
                  ))}
                </div>

                <p className="manju-shot-card__text mt-2 line-clamp-3">
                  {shot.visual || "（无画面描述）"}
                </p>
                {shot.videoPrompt?.trim() ? (
                  <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                    提示词：{shot.videoPrompt}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-amber-600/90 dark:text-amber-400/80">
                    未写 videoPrompt，将用画面描述拼装
                  </p>
                )}
                {shot.videoStatus === "failed" ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-destructive underline-offset-2 hover:underline"
                    disabled={busy}
                    onClick={() => void generateVideo(shot)}
                  >
                    生成失败，点击重试
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </JoyPhotoProvider>
  );
}
