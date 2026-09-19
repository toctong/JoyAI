"use client";

import { Loader2, Sparkles, Video } from "lucide-react";
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
  shotDurationSeconds,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";
import {
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../lib/prompt-builders";

const DURATION_OPTS = [4, 5, 8, 10] as const;

export function StoryboardVideoStep({
  project,
  episodeId = null,
}: {
  project: ManjuProjectDraft;
  episodeId?: string | null;
}) {
  const updateShot = useManjuStore((s) => s.updateShot);
  const bindJobToShotVideo = useManjuStore((s) => s.bindJobToShotVideo);

  const visibleShots = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;

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
      const mode = project.settings.mode;
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
        // i2v / grid: first = 上一镜分镜（连贯起幅）, last = 本镜分镜（落幅）
        const pushRef = (
          assetId: string | null | undefined,
          url: string | null | undefined,
        ) => {
          if (assetId) referenceAssetIds.push(assetId);
          else if (url) referenceUrls.push(url);
        };
        const prevAsset = prev?.storyboardAssetId;
        const prevUrl = prev?.storyboardImageUrl;
        if (
          (prevAsset && prevAsset !== shot.storyboardAssetId) ||
          (prevUrl && prevUrl !== shot.storyboardImageUrl)
        ) {
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
      if (mode === "grid") {
        toast.message("多宫格切块尚未实现，本次按首末帧图生视频提交");
      }

      const duration = shotDurationSeconds(shot, project);
      const job = await submitVideoJob({
        prompt: buildShotVideoPrompt(shot, project, { continuityHint }),
        duration,
        ratio: project.settings.ratio,
        referenceAssetIds: referenceAssetIds.length
          ? referenceAssetIds
          : undefined,
        referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        refMode: mode === "ref" ? "omni" : "first_last",
        modelId: project.settings.videoModelId,
      });
      bindJobToShotVideo(project.id, shot.id, job.id, "queued");
      toast.success(`镜头 ${String(shot.index).padStart(2, "0")} 已提交生视频`);
    } catch (e) {
      updateShot(project.id, shot.id, { videoStatus: "failed" });
      toast.error(e instanceof Error ? e.message : "提交失败");
    }
  };

  const generateAll = async () => {
    const targets = visibleShots.filter(
      (s) =>
        !s.videoUrl &&
        (s.visual.trim() || s.storyboardImageUrl || s.videoPrompt?.trim()) &&
        !isBusyStatus(s.videoStatus),
    );
    if (targets.length === 0) {
      toast.message("没有待生成的镜头（已跳过有成片的）");
      return;
    }
    for (const shot of targets) {
      await generateVideo(shot);
    }
  };

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
            {project.settings.mode === "i2v"
              ? "图生视频"
              : project.settings.mode === "ref"
                ? "全能参考"
                : "多宫格"}
            · 批量跳过已有成片
          </p>
          <Button size="sm" onClick={() => void generateAll()}>
            <Sparkles className="h-4 w-4" />
            全部生成视频
          </Button>
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
                    {shot.videoUrl ? "重生成" : "生成"}
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
                  <p className="mt-1 text-xs text-destructive">
                    生成失败，可重试
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </JoyPhotoProvider>
  );
}
