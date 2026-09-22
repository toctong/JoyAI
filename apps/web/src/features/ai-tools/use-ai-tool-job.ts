"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelCapabilities } from "@joyai/shared";
import { api, apiUpload, isApiCancelError } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { toast } from "@/shared/lib/toast";
import {
  layoutControlsFromCapabilities,
  type AspectOption,
  type ResolutionOption,
  type SizeOption,
} from "@/features/studio/model-options";
import { buildAiToolPrompt, type AiToolDef } from "./tool-catalog";

export type ToolResultAsset = { id: string; url: string };

export type ToolHistoryMeta = {
  prompt?: string;
  referenceUrls?: string[];
  referenceAssetIds?: string[];
  modelId?: string | null;
  modelName?: string | null;
  channelName?: string | null;
  ratio?: string | null;
  resolution?: string | null;
  size?: string | null;
  width?: number | null;
  height?: number | null;
  n?: number | null;
  kind?: "image" | "video";
  createdAt?: string;
  finishedAt?: string | null;
};

/** One history row = one job (or a local pending submit). */
export type ToolHistoryEntry = {
  id: string;
  jobId?: string;
  status: "pending" | "succeeded" | "failed";
  assets: ToolResultAsset[];
  error?: string;
  meta?: ToolHistoryMeta;
};

type HistoryJobCursor = {
  id: string;
  createdAt: string;
  finishedAt?: string | null;
};

type JobsHistoryPage = {
  items: Array<{
    id: string;
    status?: string;
    kind?: string;
    createdAt: string;
    finishedAt?: string | null;
    modelName?: string | null;
    channelName?: string | null;
    input?: Record<string, unknown> | null;
    assets?: ToolResultAsset[] | null;
  }>;
  hasMore: boolean;
};

const HISTORY_PAGE = 20;

function jobCursorIso(job: HistoryJobCursor) {
  return String(job.finishedAt || job.createdAt);
}

function metaFromJob(
  job: JobsHistoryPage["items"][number],
): ToolHistoryMeta {
  const input = job.input ?? {};
  const refs = Array.isArray(input.referenceUrls)
    ? input.referenceUrls
        .map((url) => String(url || "").trim())
        .filter(Boolean)
    : [];
  const refIds = Array.isArray(input.referenceAssetIds)
    ? input.referenceAssetIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];
  return {
    prompt: typeof input.prompt === "string" ? input.prompt : undefined,
    referenceUrls: refs,
    referenceAssetIds: refIds,
    modelId: typeof input.modelId === "string" ? input.modelId : null,
    modelName: job.modelName ?? null,
    channelName: job.channelName ?? null,
    ratio: typeof input.ratio === "string" ? input.ratio : null,
    resolution:
      typeof input.resolution === "string" ? input.resolution : null,
    size: typeof input.size === "string" ? input.size : null,
    width: typeof input.width === "number" ? input.width : null,
    height: typeof input.height === "number" ? input.height : null,
    n: typeof input.n === "number" ? input.n : null,
    kind: job.kind === "video" ? "video" : "image",
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}

function assetsOfJob(
  job: JobsHistoryPage["items"][number],
): ToolResultAsset[] {
  return (job.assets ?? [])
    .filter((asset) => Boolean(asset?.id && asset?.url))
    .map((asset) => ({ id: asset.id, url: String(asset.url) }));
}

function entriesFromJobs(items: JobsHistoryPage["items"]): ToolHistoryEntry[] {
  // API returns ASC within the newest window — flip so latest jobs lead.
  return [...items].reverse().map((job) => {
    const assets = assetsOfJob(job);
    const meta = metaFromJob(job);
    const busy =
      job.status === "queued" ||
      job.status === "running" ||
      job.status === "polling";
    if (
      busy ||
      (!assets.length &&
        job.status !== "failed" &&
        job.status !== "cancelled")
    ) {
      return {
        id: job.id,
        jobId: job.id,
        status: "pending" as const,
        assets: [],
        meta,
      };
    }
    if (job.status === "failed" || job.status === "cancelled") {
      return {
        id: job.id,
        jobId: job.id,
        status: "failed" as const,
        assets: [],
        error: job.status === "cancelled" ? "已取消" : "生成失败",
        meta,
      };
    }
    return {
      id: job.id,
      jobId: job.id,
      status: "succeeded" as const,
      assets,
      meta,
    };
  });
}

/** Keep in-flight local/pending rows that the server page has not caught up with. */
function mergeHistory(
  remote: ToolHistoryEntry[],
  localPending: ToolHistoryEntry[],
): ToolHistoryEntry[] {
  const remoteJobIds = new Set(
    remote.map((item) => item.jobId).filter(Boolean) as string[],
  );
  const keep = localPending.filter(
    (item) =>
      item.status === "pending" &&
      (!item.jobId || !remoteJobIds.has(item.jobId)),
  );
  const byId = new Map<string, ToolHistoryEntry>();
  for (const item of [...keep, ...remote]) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export type ToolPublicModel = {
  id: string;
  name: string;
  kind: "image" | "video" | "llm" | "audio";
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { platform?: string; name?: string };
};

type PendingRef = {
  localId: string;
  file: File;
  previewUrl: string;
};

type ToolPrefs = {
  modelId?: string;
  ratio?: string;
  resolution?: string;
  size?: string;
  n?: number;
};

const PREFS_KEY = "joyai.tools.prefs";

function readPrefs(): Record<string, ToolPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ToolPrefs>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefs(slug: string, patch: ToolPrefs) {
  try {
    const all = readPrefs();
    all[slug] = { ...all[slug], ...patch };
    localStorage.setItem(PREFS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function pickIn<T extends { id: string }>(
  options: T[],
  preferred?: string | null,
  fallbackId?: string | null,
) {
  if (preferred && options.some((item) => item.id === preferred)) return preferred;
  if (fallbackId && options.some((item) => item.id === fallbackId)) {
    return fallbackId;
  }
  return options[0]?.id ?? "";
}

export function useAiToolJob(tool: AiToolDef) {
  const [refs, setRefs] = useState<PendingRef[]>([]);
  const [videos, setVideos] = useState<PendingRef[]>([]);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<ToolHistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [models, setModels] = useState<ToolPublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [ratio, setRatio] = useState(tool.ratio ?? "1:1");
  const [resolution, setResolution] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [n, setN] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);
  const refsRef = useRef(refs);
  const videosRef = useRef(videos);
  const historyRef = useRef(history);
  const historyOldestRef = useRef<HistoryJobCursor | null>(null);
  const historyHasMoreRef = useRef(false);
  const historyLoadingMoreRef = useRef(false);
  refsRef.current = refs;
  videosRef.current = videos;
  historyRef.current = history;
  historyHasMoreRef.current = historyHasMore;

  const kindModels = useMemo(
    () => models.filter((item) => item.kind === tool.kind),
    [models, tool.kind],
  );

  const selectedModel = kindModels.find((item) => item.id === modelId);
  const layout = useMemo(
    () =>
      layoutControlsFromCapabilities(
        selectedModel?.capabilities,
        tool.kind === "video" ? "video" : "image",
      ),
    [selectedModel?.capabilities, tool.kind],
  );

  const selectedAspect: AspectOption | undefined =
    layout.aspects.find((item) => item.id === ratio) ?? layout.aspects[0];
  const selectedResolution: ResolutionOption | undefined =
    layout.resolutions.find((item) => item.id === resolution) ??
    layout.resolutions[0];
  const selectedSize: SizeOption | undefined =
    layout.sizes.find((item) => item.id === sizeId) ?? layout.sizes[0];

  const selected = useMemo(
    () => history.find((item) => item.id === selectedId) ?? null,
    [history, selectedId],
  );
  const results = selected?.status === "succeeded" ? selected.assets : [];
  const pendingCount = useMemo(
    () => history.filter((item) => item.status === "pending").length,
    [history],
  );

  useEffect(() => {
    return () => {
      for (const item of refsRef.current) URL.revokeObjectURL(item.previewUrl);
      for (const item of videosRef.current) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModelsReady(false);
    void api<ToolPublicModel[]>("/models")
      .then((list) => {
        if (cancelled) return;
        const next = Array.isArray(list) ? list : [];
        setModels(next);
        const prefs = readPrefs()[tool.slug] ?? {};
        const kindList = next.filter((item) => item.kind === tool.kind);
        const preferred =
          prefs.modelId && kindList.some((item) => item.id === prefs.modelId)
            ? prefs.modelId
            : (kindList[0]?.id ?? "");
        setModelId(preferred);
        if (typeof prefs.n === "number" && prefs.n >= 1 && prefs.n <= 4) {
          setN(prefs.n);
        }
        setModelsReady(true);
      })
      .catch((error) => {
        if (cancelled || isApiCancelError(error)) return;
        toast.error("模型列表加载失败");
        setModelsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tool.slug, tool.kind]);

  useEffect(() => {
    if (!modelsReady) return;
    const prefs = readPrefs()[tool.slug] ?? {};
    if (layout.showRatio && layout.aspects.length) {
      setRatio(pickIn(layout.aspects, prefs.ratio, tool.ratio));
    }
    if (layout.showResolution && layout.resolutions.length) {
      setResolution(pickIn(layout.resolutions, prefs.resolution));
    }
    if (layout.showSizePicker && layout.sizes.length) {
      setSizeId(pickIn(layout.sizes, prefs.size));
    }
  }, [
    layout.showRatio,
    layout.showResolution,
    layout.showSizePicker,
    layout.aspects,
    layout.resolutions,
    layout.sizes,
    modelsReady,
    tool.ratio,
    tool.slug,
    modelId,
  ]);

  const loadHistory = useCallback(
    async (signal?: { cancelled: boolean }) => {
      setHistoryLoading(true);
      historyOldestRef.current = null;
      try {
        const qs = new URLSearchParams({
          take: String(HISTORY_PAGE),
          scope: "tools",
          toolSlug: tool.slug,
        });
        const res = await api<JobsHistoryPage>(`/jobs?${qs}`);
        if (signal?.cancelled) return;
        const items = res.items ?? [];
        const remote = entriesFromJobs(items).filter(
          (entry) =>
            entry.status === "pending" ||
            entry.status === "failed" ||
            entry.assets.length > 0,
        );
        const localPending = historyRef.current.filter(
          (item) => item.status === "pending",
        );
        const next = mergeHistory(remote, localPending);
        setHistory(next);
        setHistoryHasMore(Boolean(res.hasMore));
        historyOldestRef.current = items[0]
          ? {
              id: items[0].id,
              createdAt: items[0].createdAt,
              finishedAt: items[0].finishedAt,
            }
          : null;
        setSelectedId((prev) => {
          if (prev && next.some((item) => item.id === prev)) return prev;
          const firstDone = next.find(
            (item) => item.status === "succeeded" && item.assets.length,
          );
          return firstDone?.id ?? null;
        });
      } catch (error) {
        if (signal?.cancelled || isApiCancelError(error)) return;
        setHistory((prev) => prev.filter((item) => item.status === "pending"));
        setHistoryHasMore(false);
        historyOldestRef.current = null;
      } finally {
        if (!signal?.cancelled) setHistoryLoading(false);
      }
    },
    [tool.slug],
  );

  const loadMoreHistory = useCallback(async () => {
    if (!historyHasMoreRef.current || historyLoadingMoreRef.current) return;
    const oldest = historyOldestRef.current;
    if (!oldest) return;

    historyLoadingMoreRef.current = true;
    setHistoryLoadingMore(true);
    try {
      const qs = new URLSearchParams({
        take: String(HISTORY_PAGE),
        scope: "tools",
        toolSlug: tool.slug,
        before: jobCursorIso(oldest),
        beforeId: oldest.id,
      });
      const res = await api<JobsHistoryPage>(`/jobs?${qs}`);
      const items = res.items ?? [];
      if (!items.length) {
        setHistoryHasMore(Boolean(res.hasMore));
        return;
      }
      const older = entriesFromJobs(items).filter(
        (entry) =>
          entry.status === "pending" ||
          entry.status === "failed" ||
          entry.assets.length > 0,
      );
      setHistory((prev) => {
        const seen = new Set(prev.map((item) => item.id));
        return [...prev, ...older.filter((item) => !seen.has(item.id))];
      });
      setHistoryHasMore(Boolean(res.hasMore));
      historyOldestRef.current = {
        id: items[0].id,
        createdAt: items[0].createdAt,
        finishedAt: items[0].finishedAt,
      };
    } catch (error) {
      if (isApiCancelError(error)) return;
      toast.error(error instanceof Error ? error.message : "加载历史失败");
    } finally {
      historyLoadingMoreRef.current = false;
      setHistoryLoadingMore(false);
    }
  }, [tool.slug]);

  useEffect(() => {
    const signal = { cancelled: false };
    void loadHistory(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [loadHistory]);

  useJobLifecycle({
    getBusyJobIds: () =>
      historyRef.current
        .filter((item) => item.status === "pending" && item.jobId)
        .map((item) => item.jobId as string),
    onCompleted: (payload) => {
      if (!payload.jobId) return;
      const assets = (payload.assets ?? [])
        .filter(
          (asset): asset is ToolResultAsset =>
            Boolean(asset?.id && asset?.url),
        )
        .map((asset) => ({ id: asset.id, url: String(asset.url) }));
      setHistory((prev) => {
        const idx = prev.findIndex(
          (item) => item.jobId === payload.jobId || item.id === payload.jobId,
        );
        if (idx < 0) {
          if (!assets.length) return prev;
          return [
            {
              id: payload.jobId,
              jobId: payload.jobId,
              status: "succeeded" as const,
              assets,
            },
            ...prev,
          ];
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          id: payload.jobId,
          jobId: payload.jobId,
          status: "succeeded",
          assets,
        };
        return next;
      });
      setSelectedId(payload.jobId);
      toast.success("生成完成");
    },
    onFailed: (payload) => {
      if (!payload.jobId) return;
      setHistory((prev) => {
        const idx = prev.findIndex(
          (item) => item.jobId === payload.jobId || item.id === payload.jobId,
        );
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          id: payload.jobId,
          jobId: payload.jobId,
          status: "failed",
          assets: [],
          error: payload.error || "生成失败",
        };
        return next;
      });
      toast.error(payload.error || "生成失败");
    },
  });

  const chooseModel = useCallback(
    (next: string) => {
      setModelId(next);
      writePrefs(tool.slug, { modelId: next });
    },
    [tool.slug],
  );

  const chooseRatio = useCallback(
    (next: string) => {
      setRatio(next);
      writePrefs(tool.slug, { ratio: next });
    },
    [tool.slug],
  );

  const chooseResolution = useCallback(
    (next: string) => {
      setResolution(next);
      writePrefs(tool.slug, { resolution: next });
    },
    [tool.slug],
  );

  const chooseSize = useCallback(
    (next: string) => {
      setSizeId(next);
      writePrefs(tool.slug, { size: next });
    },
    [tool.slug],
  );

  const chooseN = useCallback(
    (next: number) => {
      const value = Math.min(4, Math.max(1, next));
      setN(value);
      writePrefs(tool.slug, { n: value });
    },
    [tool.slug],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (!list.length) {
        toast.error("请选择图片文件");
        return;
      }
      setRefs((prev) => {
        const room = Math.max(0, tool.refsMax - prev.length);
        const next = list.slice(0, room).map((file) => ({
          localId: `ref_${crypto.randomUUID().slice(0, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        if (!next.length) {
          toast.error(`最多上传 ${tool.refsMax} 张参考图`);
          return prev;
        }
        return [...prev, ...next];
      });
    },
    [tool.refsMax],
  );

  const removeRef = useCallback((localId: string) => {
    setRefs((prev) => {
      const hit = prev.find((item) => item.localId === localId);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }, []);

  const videosMax = tool.videosMax ?? 0;

  const addVideos = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files).filter((file) =>
        file.type.startsWith("video/"),
      );
      if (!list.length) {
        toast.error("请选择视频文件");
        return;
      }
      setVideos((prev) => {
        const room = Math.max(0, videosMax - prev.length);
        const next = list.slice(0, room).map((file) => ({
          localId: `vid_${crypto.randomUUID().slice(0, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }));
        if (!next.length) {
          toast.error(`最多上传 ${videosMax} 段参考视频`);
          return prev;
        }
        return [...prev, ...next];
      });
    },
    [videosMax],
  );

  const removeVideo = useCallback((localId: string) => {
    setVideos((prev) => {
      const hit = prev.find((item) => item.localId === localId);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((item) => item.localId !== localId);
    });
  }, []);

  const selectHistory = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const clearResults = useCallback(() => setSelectedId(null), []);

  const dismissFailed = useCallback((id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const submit = useCallback(async () => {
    if (tool.status !== "available") {
      toast.error("该工具即将上线");
      return;
    }
    if (refs.length < tool.refsRequired) {
      toast.error(`请至少上传 ${tool.refsRequired} 张参考图`);
      return;
    }
    const videosRequired = tool.videosRequired ?? 0;
    if (videos.length < videosRequired) {
      toast.error(`请上传 ${videosRequired} 段动作参考视频`);
      return;
    }
    if (tool.noteRequired && !note.trim()) {
      toast.error("请先填写品牌名或品牌说明");
      return;
    }
    if (!modelId && kindModels.length > 0) {
      toast.error("请先选择模型");
      return;
    }
    const prompt = buildAiToolPrompt(tool, note);
    if (!prompt.trim()) {
      toast.error("工具提示词未配置");
      return;
    }

    const localId = `pending_${crypto.randomUUID().slice(0, 10)}`;
    const pendingMeta: ToolHistoryMeta = {
      prompt,
      referenceUrls: [],
      referenceAssetIds: [],
      modelId: modelId || null,
      modelName: selectedModel?.name ?? null,
      channelName: selectedModel?.channel?.name ?? null,
      ratio:
        layout.showRatio && selectedAspect
          ? selectedAspect.id
          : tool.ratio ?? null,
      resolution:
        layout.showResolution && selectedResolution
          ? selectedResolution.id
          : null,
      size:
        layout.showSizePicker && selectedSize ? selectedSize.id : null,
      width:
        layout.showSizePicker && selectedSize ? selectedSize.width : null,
      height:
        layout.showSizePicker && selectedSize ? selectedSize.height : null,
      n: tool.kind === "image" ? n : null,
      kind: tool.kind === "video" ? "video" : "image",
      createdAt: new Date().toISOString(),
    };
    setHistory((prev) => [
      {
        id: localId,
        status: "pending",
        assets: [],
        meta: pendingMeta,
      },
      ...prev,
    ]);
    setSelectedId(localId);

    try {
      const uploaded: { id: string; url: string }[] = [];
      for (const item of [...refs, ...videos]) {
        const asset = await apiUpload<{ id: string; url: string }>(
          "/upload",
          item.file,
        );
        uploaded.push({ id: asset.id, url: asset.url });
      }

      const referenceUrls = uploaded.map((item) => item.url);
      const input: Record<string, unknown> = {
        prompt,
        n: tool.kind === "image" ? n : undefined,
        modelId: modelId || undefined,
        referenceAssetIds: uploaded.map((item) => item.id),
        referenceUrls,
        toolSlug: tool.slug,
      };

      if (tool.kind === "image") {
        if (layout.showRatio && selectedAspect) {
          input.ratio = selectedAspect.id;
        } else if (tool.ratio) {
          input.ratio = tool.ratio;
        }
        if (layout.showResolution && selectedResolution) {
          input.resolution = selectedResolution.id;
        }
        if (layout.showSizePicker && selectedSize) {
          input.size = selectedSize.id;
          input.width = selectedSize.width;
          input.height = selectedSize.height;
        }
      } else {
        input.refMode = "omni";
        if (layout.showRatio && selectedAspect) {
          input.ratio = selectedAspect.id;
        }
        if (layout.showResolution && selectedResolution) {
          input.resolution = selectedResolution.id;
        }
      }

      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: { kind: tool.kind, input },
      });
      setHistory((prev) =>
        prev.map((item) =>
          item.id === localId
            ? {
                ...item,
                id: job.id,
                jobId: job.id,
                status: "pending",
                meta: {
                  ...pendingMeta,
                  referenceUrls,
                  referenceAssetIds: uploaded.map((item) => item.id),
                },
              }
            : item,
        ),
      );
      setSelectedId((prev) => (prev === localId ? job.id : prev));
      toast.success("任务已提交");
    } catch (error) {
      setHistory((prev) =>
        prev.map((item) =>
          item.id === localId
            ? {
                ...item,
                status: "failed",
                error:
                  error instanceof Error ? error.message : "提交失败",
              }
            : item,
        ),
      );
      if (isApiCancelError(error)) return;
      toast.error(error instanceof Error ? error.message : "提交失败");
    }
  }, [
    kindModels.length,
    layout.showRatio,
    layout.showResolution,
    layout.showSizePicker,
    modelId,
    n,
    note,
    refs,
    videos,
    selectedAspect,
    selectedModel,
    selectedResolution,
    selectedSize,
    tool,
  ]);

  const regenerate = useCallback(
    async (entry: ToolHistoryEntry) => {
      if (tool.status !== "available") {
        toast.error("该工具即将上线");
        return;
      }
      const meta = entry.meta;
      const prompt = meta?.prompt?.trim();
      if (!prompt) {
        toast.error("无法重新生成：缺少提示词");
        return;
      }

      const referenceUrls = meta.referenceUrls ?? [];
      const referenceAssetIds = meta.referenceAssetIds ?? [];
      const nextModelId = meta.modelId || modelId || undefined;
      const localId = `pending_${crypto.randomUUID().slice(0, 10)}`;
      const pendingMeta: ToolHistoryMeta = {
        ...meta,
        prompt,
        referenceUrls,
        referenceAssetIds,
        modelId: nextModelId ?? null,
        modelName:
          kindModels.find((item) => item.id === nextModelId)?.name ??
          meta.modelName ??
          null,
        createdAt: new Date().toISOString(),
        finishedAt: null,
      };

      setHistory((prev) => {
        const next = [
          {
            id: localId,
            status: "pending" as const,
            assets: [] as ToolResultAsset[],
            meta: pendingMeta,
          },
          ...(entry.status === "failed"
            ? prev.filter((item) => item.id !== entry.id)
            : prev),
        ];
        return next;
      });
      setSelectedId(localId);

      // Drop the failed job from server so it won't reappear after refresh.
      if (entry.status === "failed") {
        const removeId = entry.jobId || entry.id;
        if (removeId && !removeId.startsWith("pending_")) {
          void api(`/jobs/${removeId}`, { method: "DELETE" }).catch(() => {
            /* ignore — UI already removed */
          });
        }
      }

      try {
        const input: Record<string, unknown> = {
          prompt,
          n: tool.kind === "image" ? (meta.n ?? n) : undefined,
          modelId: nextModelId,
          referenceAssetIds,
          referenceUrls,
          toolSlug: tool.slug,
        };
        if (meta.ratio) input.ratio = meta.ratio;
        if (meta.resolution) input.resolution = meta.resolution;
        if (meta.size) {
          input.size = meta.size;
          if (meta.width) input.width = meta.width;
          if (meta.height) input.height = meta.height;
        }
        if (tool.kind === "video") {
          input.refMode = "omni";
        }

        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: { kind: tool.kind, input },
        });
        setHistory((prev) =>
          prev.map((item) =>
            item.id === localId
              ? {
                  ...item,
                  id: job.id,
                  jobId: job.id,
                  status: "pending",
                }
              : item,
          ),
        );
        setSelectedId((prev) => (prev === localId ? job.id : prev));
        toast.success("已重新提交");
      } catch (error) {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === localId
              ? {
                  ...item,
                  status: "failed",
                  error:
                    error instanceof Error ? error.message : "重新生成失败",
                }
              : item,
          ),
        );
        if (isApiCancelError(error)) return;
        toast.error(error instanceof Error ? error.message : "重新生成失败");
      }
    },
    [kindModels, modelId, n, tool],
  );

  return {
    refs,
    videos,
    note,
    setNote,
    results,
    selected,
    selectedId,
    selectHistory,
    dismissFailed,
    history,
    pendingCount,
    historyHasMore,
    historyLoading,
    historyLoadingMore,
    loadMoreHistory,
    models: kindModels,
    modelsReady,
    modelId,
    chooseModel,
    selectedModel,
    layout,
    ratio,
    chooseRatio,
    resolution,
    chooseResolution,
    sizeId,
    chooseSize,
    n,
    chooseN,
    addFiles,
    removeRef,
    addVideos,
    removeVideo,
    clearResults,
    submit,
    regenerate,
  };
}
