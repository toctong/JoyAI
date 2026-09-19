"use client";

import { useEffect } from "react";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { toast } from "@/shared/lib/toast";
import { useManjuStore } from "./manju-store";
import type { ManjuJobStatus } from "./manju-types";

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
          purpose === "author_prompts") &&
        manjuProjectId
      ) {
        void loadProject(manjuProjectId)
          .then(() => {
            toast.success(
              purpose === "author_prompts"
                ? "提示词已写回镜头"
                : purpose === "script_plan" || purpose === "split_shots"
                  ? "分镜规划已写入"
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
      job?: { id?: string; error?: string | null };
    }) => {
      const jobId = resolveJobId(payload);
      if (!jobId) return;
      applyJobResult({ jobId, status: "failed" });
      if (activeProjectId) setAnalyzing(activeProjectId, false);
      toast.error(payload.error || payload.job?.error || "生成失败");
    };

    const onAssetUpdated = (payload: {
      asset?: { id?: string; url?: string | null };
      jobId?: string | null;
    }) => {
      const jobId = payload.jobId;
      const url = payload.asset?.url;
      const assetId = payload.asset?.id;
      if (!jobId || !url) return;
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
}

export async function submitImageJob(input: {
  prompt: string;
  ratio?: string;
  referenceAssetIds?: string[];
  referenceUrls?: string[];
  modelId?: string;
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
      },
    },
  });
}
