"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModelCapabilities } from "@joyai/shared";
import { api, apiUpload, isApiCancelError } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { toast } from "@/shared/lib/toast";
import {
  layoutControlsFromCapabilities,
  type AspectOption,
  type ResolutionOption,
  type SizeOption,
} from "@/features/studio/model-options";
import { buildAiToolPrompt, type AiToolDef } from "./tool-catalog";

export type ToolResultAsset = { id: string; url: string };

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
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [results, setResults] = useState<ToolResultAsset[]>([]);
  const [history, setHistory] = useState<ToolResultAsset[]>([]);
  const [models, setModels] = useState<ToolPublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [ratio, setRatio] = useState(tool.ratio ?? "1:1");
  const [resolution, setResolution] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [n, setN] = useState(1);
  const [modelsReady, setModelsReady] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const refsRef = useRef(refs);
  jobIdRef.current = jobId;
  refsRef.current = refs;

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

  useEffect(() => {
    return () => {
      for (const item of refsRef.current) URL.revokeObjectURL(item.previewUrl);
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

  useEffect(() => {
    let cancelled = false;
    void api<{
      items: Array<{ assets?: ToolResultAsset[] | null }>;
    }>(
      `/jobs?take=24&scope=tools&toolSlug=${encodeURIComponent(tool.slug)}`,
    )
      .then((res) => {
        if (cancelled) return;
        const assets = (res.items ?? [])
          .flatMap((job) => job.assets ?? [])
          .filter((asset) => Boolean(asset?.id && asset?.url))
          .slice(0, 24);
        setHistory(assets);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tool.slug]);

  useEffect(() => {
    const socket = getJobsSocket();
    const onCompleted = (payload: {
      jobId?: string;
      assets?: ToolResultAsset[];
    }) => {
      if (!payload.jobId || payload.jobId !== jobIdRef.current) return;
      const assets = payload.assets ?? [];
      setResults(assets);
      if (assets.length) {
        setHistory((prev) => [...assets, ...prev].slice(0, 24));
      }
      setBusy(false);
      setJobId(null);
      toast.success("生成完成");
    };
    const onFailed = (payload: { jobId?: string; error?: string }) => {
      if (!payload.jobId || payload.jobId !== jobIdRef.current) return;
      setBusy(false);
      setJobId(null);
      toast.error(payload.error || "生成失败");
    };
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);
    return () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
    };
  }, []);

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

  const clearResults = useCallback(() => setResults([]), []);

  const submit = useCallback(async () => {
    if (tool.status !== "available") {
      toast.error("该工具即将上线");
      return;
    }
    if (refs.length < tool.refsRequired) {
      toast.error(`请至少上传 ${tool.refsRequired} 张参考图`);
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

    setBusy(true);
    setResults([]);
    try {
      const uploaded: { id: string; url: string }[] = [];
      for (const item of refs) {
        const asset = await apiUpload<{ id: string; url: string }>(
          "/upload",
          item.file,
        );
        uploaded.push({ id: asset.id, url: asset.url });
      }

      const input: Record<string, unknown> = {
        prompt,
        n: tool.kind === "image" ? n : undefined,
        modelId: modelId || undefined,
        referenceAssetIds: uploaded.map((item) => item.id),
        referenceUrls: uploaded.map((item) => item.url),
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
      setJobId(job.id);
      toast.success("任务已提交");
    } catch (error) {
      setBusy(false);
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
    selectedAspect,
    selectedResolution,
    selectedSize,
    tool,
  ]);

  return {
    refs,
    note,
    setNote,
    busy,
    results,
    history,
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
    clearResults,
    submit,
  };
}
