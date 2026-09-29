"use client";

import { useCallback, useEffect } from "react";
import { api } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "./manju-store";
import { isBusyStatus, type ManjuJobStatus } from "./manju-types";
import {
  applyGridJobSplit,
  peekGridJob,
  takeGridJob,
} from "./lib/grid-jobs";
import { isManjuAssetSubmitPending } from "./lib/pending-asset-submit";
import {
  manjuJobKindLabel,
  manjuPurposeLabel,
} from "./lib/manju-job-labels";

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

function collectBusyJobIds(projectId: string): string[] {
  const project = useManjuStore
    .getState()
    .projects.find((p) => p.id === projectId);
  if (!project) return [];
  const jobIds = new Set<string>();
  // AI 解析剧本：提交后写入 lastAnalyzeJobId，WS 丢包时靠轮询收尾
  if (
    useManjuStore.getState().analyzingIds[projectId] &&
    project.lastAnalyzeJobId?.trim()
  ) {
    jobIds.add(project.lastAnalyzeJobId.trim());
  }
  for (const asset of project.assets) {
    if (isBusyStatus(asset.status) && asset.jobId?.trim()) {
      jobIds.add(asset.jobId.trim());
    }
  }
  for (const shot of project.shots) {
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
  return [...jobIds];
}

/** 监听全局 job 事件，回写到漫剧草稿；LLM 分析完成则重新拉项目 */
export function useManjuJobBridge(activeProjectId?: string) {
  const applyJobResult = useManjuStore((s) => s.applyJobResult);
  const loadProject = useManjuStore((s) => s.loadProject);
  const setAnalyzing = useManjuStore((s) => s.setAnalyzing);

  const onProgress = useCallback(
    (payload: {
      jobId?: string;
      status?: string;
      job?: { id?: string; status?: string };
    }) => {
      const jobId = resolveJobId(payload);
      const status = payload.status ?? payload.job?.status;
      if (!jobId || !status) return;
      if (peekGridJob(jobId)) {
        applyJobResult({ jobId, status: mapStatus(status) });
        return;
      }
      applyJobResult({
        jobId,
        status: mapStatus(status),
      });
    },
    [applyJobResult],
  );

  const onCompleted = useCallback(
    (payload: {
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
          purpose === "plan_episodes" ||
          purpose === "novel_analyze" ||
          purpose === "manju_review") &&
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
                      : purpose === "novel_analyze"
                        ? "长文拆集完成：梗概、标签与分集已写入"
                        : purpose === "manju_review"
                          ? "制作检查报告已生成"
                          : "AI 解析完成：题材标签、梗概与资产已写入",
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
    },
    [applyJobResult, loadProject, setAnalyzing],
  );

  const onFailed = useCallback(
    (payload: {
      jobId?: string;
      error?: string;
      status?: string;
      purpose?: string;
      kind?: string;
      job?: {
        id?: string;
        error?: string | null;
        status?: string;
        kind?: string;
        input?: { purpose?: string } | null;
      };
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
        return;
      }
      const purpose =
        payload.purpose ??
        payload.job?.input?.purpose ??
        null;
      const kind = payload.kind ?? payload.job?.kind ?? null;
      const label = purpose
        ? manjuPurposeLabel(purpose)
        : manjuJobKindLabel(kind);
      toast.error(`${label}失败：${err}`);
    },
    [activeProjectId, applyJobResult, setAnalyzing],
  );

  const onAssetUpdated = useCallback(
    (payload: {
      asset?: { id?: string; url?: string | null };
      jobId?: string | null;
    }) => {
      const jobId = payload.jobId;
      const url = payload.asset?.url;
      const assetId = payload.asset?.id;
      if (!jobId || !url) return;
      if (peekGridJob(jobId)) {
        return;
      }
      applyJobResult({
        jobId,
        status: "succeeded",
        url,
        assetId: assetId ?? null,
      });
    },
    [applyJobResult],
  );

  useJobLifecycle({
    enabled: Boolean(activeProjectId),
    getBusyJobIds: () =>
      activeProjectId ? collectBusyJobIds(activeProjectId) : [],
    onProgress,
    onCompleted,
    onFailed,
    onAssetUpdated,
  });

  // Clear busy flags left without a jobId (refresh residue / aborted submit).
  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;

    function scrubOrphans() {
      if (cancelled) return;
      const project = useManjuStore
        .getState()
        .projects.find((p) => p.id === activeProjectId);
      if (!project) return;

      const updateAsset = useManjuStore.getState().updateAsset;
      const updateShot = useManjuStore.getState().updateShot;

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
    }

    scrubOrphans();
    const timer = window.setInterval(scrubOrphans, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeProjectId]);
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
