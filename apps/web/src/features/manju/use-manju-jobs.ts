"use client";

import { useEffect } from "react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "./manju-store";
import { isBusyStatus, type ManjuJobStatus } from "./manju-types";
import {
  applyGridJobSplit,
  peekGridJob,
  takeGridJob,
} from "./lib/grid-jobs";
import { isManjuAssetSubmitPending } from "./lib/pending-asset-submit";

type JobAsset = {
  id: string;
  url?: string | null;
  kind?: string;
};

function mapStatus(status: string): ManjuJobStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "polling":
      return "polling";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "running";
  }
}

function pickMedia(assets: JobAsset[] | undefined): {
  url: string | null;
  assetId: string | null;
} {
  const first = assets?.find((a) => a.url) ?? assets?.[0];
  return {
    url: first?.url ?? null,
    assetId: first?.id ?? null,
  };
}

function resolveJobId(payload: {
  jobId?: string;
  job?: { id?: string };
  id?: string;
}): string | null {
  return payload.jobId ?? payload.job?.id ?? payload.id ?? null;
}

/** 监听全局 job 事件，回写到漫剧草稿；LLM 分析完成则重新拉项目 */
export function useManjuJobBridge(activeProjectId?: string) {
  const applyJobResult = useManjuStore((s) => s.applyJobResult);
  const loadProject = useManjuStore((s) => s.loadProject);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);

  useEffect(() => {
    const socket = getJobsSocket();

    const onProgress = (payload: {
      jobId?: string;
      status?: string;
      job?: { id?: string; status?: string };
    }) => {
      const jobId = resolveJobId(payload);
      const status = payload.status ?? payload.job?.status;
      if (!jobId || !status) return;
      // 宫格整图：只更新状态，等 completed 再切块
      if (peekGridJob(jobId)) {
        applyJobResult({ jobId, status: mapStatus(status) });
        return;
      }
      applyJobResult({
        jobId,
        status: mapStatus(status),
      });
    };

    const onCompleted = (payload: {
      jobId?: string;
      status?: string;
      assets?: JobAsset[];
      result?: {
        purpose?: string;
        manjuProjectId?: string | null;
        analyze?: unknown;
      };
      job?: { id?: string; assets?: JobAsset[] };
    }) => {
      const jobId = resolveJobId(payload);
      if (!jobId) return;

      const manjuProjectId = payload.result?.manjuProjectId;
      const purpose = payload.result?.purpose;
      if (
        (purpose === "analyze_assets" ||
          purpose === "split_shots" ||
          purpose === "script_plan" ||
          purpose === "author_prompts" ||
          purpose === "series_memory" ||
          purpose === "plan_episodes") &&
        manjuProjectId
      ) {
        void loadProject(manjuProjectId)
          .then(() => {
            toast.success(
              purpose === "author_prompts"
                ? "提示词已写回镜头"
                : purpose === "script_plan" || purpose === "split_shots"
                  ? "分镜规划已写入"
                  : purpose === "series_memory"
                    ? "连载记忆已写入"
                    : purpose === "plan_episodes"
                      ? "分集规划已写入"
                      : "资产与分集已写入",
            );
          })
          .catch(() => {
            toast.message("分析完成，请刷新项目");
          })
          .finally(() => {
            setAnalyzing(manjuProjectId, false);
          });
        return;
      }

      const media = pickMedia(payload.assets ?? payload.job?.assets);
      const grid = peekGridJob(jobId);
      if (grid) {
        if (!media.url) {
          void applyGridJobSplit(jobId, grid, "", "failed");
          toast.error("宫格图缺少结果地址");
          return;
        }
        toast.message("宫格图已出，正在切块…");
        void applyGridJobSplit(jobId, { ...grid }, media.url, "succeeded").then(
          () => toast.success(`已切成 ${grid.shotIds.length} 格分镜`),
        );
        return;
      }

      applyJobResult({
        jobId,
        status: "succeeded",
        url: media.url,
        assetId: media.assetId,
      });
    };

    const onFailed = (payload: {
      jobId?: string;
      error?: string;
      status?: string;
      job?: { id?: string; error?: string | null; status?: string };
    }) => {
      const jobId = resolveJobId(payload);
      if (!jobId) return;
      const grid = takeGridJob(jobId);
      if (grid) {
        for (const shotId of grid.shotIds) {
          useManjuStore.getState().updateShot(grid.projectId, shotId, {
            storyboardStatus: "failed",
          });
        }
      } else {
        applyJobResult({ jobId, status: "failed" });
      }
      if (activeProjectId) setAnalyzing(activeProjectId, false);
      const status = payload.status ?? payload.job?.status;
      const err = payload.error || payload.job?.error || "生成失败";
      if (status === "cancelled" || err === "已中断") {
        toast.message("已停止生成");
      } else {
        toast.error(err);
      }
    };

    const onAssetUpdated = (payload: {
      asset?: { id?: string; url?: string | null };
      jobId?: string | null;
    }) => {
      const jobId = payload.jobId;
      const url = payload.asset?.url;
      const assetId = payload.asset?.id;
      if (!jobId || !url) return;
      if (peekGridJob(jobId)) {
        // 宫格等 job:completed 统一切块，避免半成品写进单镜
        return;
      }
      applyJobResult({
        jobId,
        status: "succeeded",
        url,
        assetId: assetId ?? null,
      });
    };

    socket.on("job:progress", onProgress);
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);
    socket.on("asset:updated", onAssetUpdated);

    return () => {
      socket.off("job:progress", onProgress);
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
      socket.off("asset:updated", onAssetUpdated);
    };
  }, [activeProjectId, applyJobResult, loadProject, setAnalyzing]);

  // 对账：WS 丢事件时，按 jobId 拉终态，避免资产/镜头一直转圈
  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;

    async function reconcileBusyJobs() {
      const project = useManjuStore
        .getState()
        .projects.find((p) => p.id === activeProjectId);
      if (!project) return;

      const updateAsset = useManjuStore.getState().updateAsset;
      const updateShot = useManjuStore.getState().updateShot;

      // 无 jobId 却 busy：刷新残留；跳过正在提交、尚未绑 jobId 的卡
      for (const asset of project.assets) {
        if (
          isBusyStatus(asset.status) &&
          !asset.jobId?.trim() &&
          !isManjuAssetSubmitPending(asset.id)
        ) {
          updateAsset(project.id, asset.id, {
            jobId: null,
            status: asset.imageUrl ? "succeeded" : "idle",
          });
        }
      }
      for (const shot of project.shots) {
        if (
          isBusyStatus(shot.storyboardStatus) &&
          !shot.storyboardJobId?.trim()
        ) {
          updateShot(project.id, shot.id, {
            storyboardJobId: null,
            storyboardStatus: shot.storyboardImageUrl ? "succeeded" : "idle",
          });
        }
        if (isBusyStatus(shot.videoStatus) && !shot.videoJobId?.trim()) {
          updateShot(project.id, shot.id, {
            videoJobId: null,
            videoStatus: shot.videoUrl ? "succeeded" : "idle",
          });
        }
      }

      const fresh = useManjuStore
        .getState()
        .projects.find((p) => p.id === activeProjectId);
      if (!fresh) return;

      const jobIds = new Set<string>();
      for (const asset of fresh.assets) {
        if (isBusyStatus(asset.status) && asset.jobId?.trim()) {
          jobIds.add(asset.jobId.trim());
        }
      }
      for (const shot of fresh.shots) {
        if (
          isBusyStatus(shot.storyboardStatus) &&
          shot.storyboardJobId?.trim()
        ) {
          jobIds.add(shot.storyboardJobId.trim());
        }
        if (isBusyStatus(shot.videoStatus) && shot.videoJobId?.trim()) {
          jobIds.add(shot.videoJobId.trim());
        }
      }
      if (jobIds.size === 0) return;

      await Promise.all(
        [...jobIds].map(async (jobId) => {
          if (cancelled) return;
          try {
            const job = await api<{
              id: string;
              status: string;
              error?: string | null;
              assets?: JobAsset[];
            }>(`/jobs/${jobId}`);
            if (cancelled) return;
            if (job.status === "succeeded") {
              const media = pickMedia(job.assets);
              const grid = peekGridJob(jobId);
              if (grid) {
                if (media.url) {
                  void applyGridJobSplit(jobId, grid, media.url, "succeeded");
                }
                return;
              }
              applyJobResult({
                jobId: job.id,
                status: "succeeded",
                url: media.url,
                assetId: media.assetId,
              });
            } else if (
              job.status === "failed" ||
              job.status === "cancelled"
            ) {
              if (peekGridJob(jobId)) takeGridJob(jobId);
              applyJobResult({ jobId: job.id, status: "failed" });
            }
          } catch {
            /* ignore transient */
          }
        }),
      );
    }

    void reconcileBusyJobs();
    const timer = window.setInterval(() => void reconcileBusyJobs(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeProjectId, applyJobResult]);
}

export async function submitImageJob(input: {
  prompt: string;
  ratio?: string;
  referenceAssetIds?: string[];
  referenceUrls?: string[];
  modelId?: string;
  manjuProjectId: string;
}): Promise<{ id: string }> {
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "image",
      input: {
        prompt: input.prompt,
        ratio: input.ratio,
        n: 1,
        modelId: input.modelId || undefined,
        referenceAssetIds: input.referenceAssetIds,
        referenceUrls: input.referenceUrls,
        manjuProjectId: input.manjuProjectId,
      },
    },
  });
}

export async function submitVideoJob(input: {
  prompt: string;
  duration?: number;
  ratio?: string;
  referenceAssetIds?: string[];
  referenceUrls?: string[];
  refMode?: "omni" | "first_last";
  modelId?: string;
  manjuProjectId: string;
}): Promise<{ id: string }> {
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "video",
      input: {
        prompt: input.prompt,
        duration: input.duration,
        ratio: input.ratio,
        modelId: input.modelId || undefined,
        referenceAssetIds: input.referenceAssetIds,
        referenceUrls: input.referenceUrls,
        refMode: input.refMode,
        manjuProjectId: input.manjuProjectId,
      },
    },
  });
}
