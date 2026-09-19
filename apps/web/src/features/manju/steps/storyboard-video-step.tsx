"use client";

import { Loader2, Sparkles, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "../manju-store";
import { submitVideoJob } from "../use-manju-jobs";
import {
  buildShotVideoPrompt,
  isBusyStatus,
  type ManjuProjectDraft,
  type ManjuShotDraft,
} from "../manju-types";
import {
  referenceMediaFromSlots,
  resolveShotReferenceSlots,
} from "../lib/prompt-builders";

export function StoryboardVideoStep({
  project,
}: {
  project: ManjuProjectDraft;
}) {
  const updateShot = useManjuStore((s) => s.updateShot);
  const bindJobToShotVideo = useManjuStore((s) => s.bindJobToShotVideo);

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
      const slots = resolveShotReferenceSlots(shot, project);
      const fromAssets = referenceMediaFromSlots(slots);
      const referenceAssetIds = [
        ...(shot.storyboardAssetId ? [shot.storyboardAssetId] : []),
        ...fromAssets.referenceAssetIds,
      ];
      const referenceUrls = [
        ...(shot.storyboardImageUrl ? [shot.storyboardImageUrl] : []),
        ...fromAssets.referenceUrls,
      ];

      const job = await submitVideoJob({
        prompt: buildShotVideoPrompt(shot, project),
        duration: project.settings.duration,
        ratio: project.settings.ratio,
        referenceAssetIds: referenceAssetIds.length
          ? referenceAssetIds
          : undefined,
        referenceUrls: referenceUrls.length ? referenceUrls : undefined,
        refMode: project.settings.mode === "ref" ? "omni" : "first_last",
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
    const targets = project.shots.filter(
      (s) =>
        (s.visual.trim() || s.storyboardImageUrl || s.videoPrompt?.trim()) &&
        !isBusyStatus(s.videoStatus),
    );
    if (targets.length === 0) {
      toast.message("没有可生成的镜头");
      return;
    }
    for (const shot of targets) {
      await generateVideo(shot);
    }
  };

  if (project.shots.length === 0) {
    return (
      <div className="manju-card">
        <div className="manju-card__title">分镜视频</div>
        <p className="manju-card__desc">
          尚无分镜。请先在「分镜脚本」中创建镜头卡。
        </p>
      </div>
    );
  }

  const done = project.shots.filter((s) => s.videoUrl).length;

  return (
    <JoyPhotoProvider>
      <div className="manju-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            共 {project.shots.length} 镜 · 已完成 {done} · 模式{" "}
            {project.settings.mode === "i2v"
              ? "图生视频"
              : project.settings.mode === "ref"
                ? "全能参考"
                : "多宫格"}
          </p>
          <Button size="sm" onClick={() => void generateAll()}>
            <Sparkles className="h-4 w-4" />
            全部生成视频
          </Button>
        </div>

        <div className="manju-shot-grid">
          {project.shots.map((shot) => {
            const busy = isBusyStatus(shot.videoStatus);
            return (
              <article key={shot.id} className="manju-shot-card">
                <div className="mb-2 flex items-center justify-between">
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

                <p className="manju-shot-card__text mt-2 line-clamp-3">
                  {shot.visual || "（无画面描述）"}
                </p>
                {shot.videoPrompt?.trim() ? (
                  <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                    提示词：{shot.videoPrompt}
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-amber-400/80">
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
