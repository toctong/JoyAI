"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Button,
  CheckList,
  DotLoading,
  Empty,
  Image,
  ImageViewer,
  Popup,
  TextArea,
  Toast,
} from "antd-mobile";
import {
  ChevronDown,
  ImagePlus,
  Play,
  Ratio,
  RefreshCw,
  WandSparkles,
  X,
} from "lucide-react";
import type { ModelCapabilities } from "@joyai/shared";
import { assetListImageUrl, tosVideoPosterUrl } from "@joyai/shared";
import { api, apiUpload } from "@/shared/lib/api";
import { modelIconSrc } from "@/shared/lib/brand-icons";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { ensureGenerationNotifyPermission } from "@/shared/lib/generation-notify";
import { watchStudioGeneration } from "@/shared/lib/studio-generation-notify-host";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import {
  DEFAULT_ASPECTS,
  durationsFromCapabilities,
  layoutControlsFromCapabilities,
} from "@/features/studio/model-options";
import {
  consumeStudioRemixSeed,
  type StudioRemixSeed,
} from "@/features/studio/studio-remix-seed";

type PublicModel = {
  id: string;
  name: string;
  kind: "image" | "video";
  remoteId?: string;
  capabilities?: ModelCapabilities | null;
  channel?: { name?: string };
};

type Asset = { id: string; url: string; kind?: string };

type Job = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
  finishedAt?: string | null;
  modelName?: string | null;
  input?: {
    prompt?: string;
    modelId?: string;
    referenceUrls?: string[];
    canvasProjectId?: string;
    manjuProjectId?: string;
    toolSlug?: string;
    ratio?: string;
    n?: number;
    duration?: number;
  };
  assets?: Asset[];
  error?: string | null;
  canvasProjectId?: string | null;
};

type JobsPage = { items: Job[]; hasMore: boolean };

type LocalRef = {
  localId: string;
  previewUrl: string;
  url?: string;
  uploading?: boolean;
};

const JOBS_PAGE = 24;
const MAX_REFS = 4;
const IMAGE_COUNTS = [1, 2, 4] as const;

function isStudioFeedJob(job: Job) {
  if (job.canvasProjectId) return false;
  if (job.input?.canvasProjectId) return false;
  if (job.input?.manjuProjectId) return false;
  if (job.input?.toolSlug) return false;
  return job.kind === "image" || job.kind === "video";
}

function isBusy(status: string) {
  return status === "queued" || status === "running" || status === "polling";
}

function firstModelId(models: PublicModel[], kind: "image" | "video") {
  return models.find((m) => m.kind === kind)?.id ?? "";
}

function resolveModelId(
  models: PublicModel[],
  kind: "image" | "video",
  preferred?: string | null,
) {
  if (preferred && models.some((m) => m.id === preferred && m.kind === kind)) {
    return preferred;
  }
  return firstModelId(models, kind);
}

function modelPrimary(m: PublicModel) {
  return m.name.trim() || "未命名模型";
}

function modelSecondary(m: PublicModel) {
  return m.channel?.name?.trim() || "";
}

function modelIcon(m: PublicModel) {
  return modelIconSrc({ remoteId: m.remoteId, name: m.name });
}

function jobThumb(job: Job): string | null {
  const asset = job.assets?.[0];
  if (!asset?.url) return null;
  if (asset.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(asset.url)) {
    return tosVideoPosterUrl(asset.url) || asset.url;
  }
  return assetListImageUrl({ url: asset.url, size: "md" }) || asset.url;
}

function statusLabel(status: string) {
  if (status === "queued") return "排队";
  if (status === "running" || status === "polling") return "生成中";
  if (status === "succeeded") return "完成";
  if (status === "failed") return "失败";
  return status;
}

function readBootSeed(): StudioRemixSeed | null {
  if (typeof window === "undefined") return null;
  return consumeStudioRemixSeed();
}

function shortPrompt(text: string | undefined, max = 18) {
  const t = text?.trim() || "未命名";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function MobileStudioPage() {
  const search = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const bootRef = useRef<StudioRemixSeed | null | undefined>(undefined);
  if (bootRef.current === undefined) {
    bootRef.current = readBootSeed();
  }
  const boot = bootRef.current;

  const urlType = search.get("type");
  const initialKind: "image" | "video" =
    boot?.type === "video" || boot?.type === "image"
      ? boot.type
      : urlType === "video" || urlType === "image"
        ? urlType
        : "image";

  const [kind, setKind] = useState<"image" | "video">(initialKind);
  const [prompt, setPrompt] = useState(boot?.prompt ?? "");
  const [refs, setRefs] = useState<LocalRef[]>(() =>
    (boot?.refs ?? []).map((url) => ({
      localId: `boot_${url.slice(-8)}`,
      previewUrl: url,
      url,
    })),
  );
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelId, setModelId] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [paramOpen, setParamOpen] = useState<"ratio" | "count" | "duration" | null>(
    null,
  );
  const [ratio, setRatio] = useState("1:1");
  const [count, setCount] = useState(1);
  const [duration, setDuration] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [bootstrapped, setBootstrapped] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const kindModels = useMemo(
    () => models.filter((m) => m.kind === kind),
    [models, kind],
  );

  const selectedModel = useMemo(
    () => kindModels.find((m) => m.id === modelId) ?? null,
    [kindModels, modelId],
  );
  const selectedIcon = selectedModel ? modelIcon(selectedModel) : null;

  const layout = useMemo(
    () =>
      layoutControlsFromCapabilities(
        selectedModel?.capabilities ?? null,
        kind,
      ),
    [selectedModel?.capabilities, kind],
  );

  const aspectOptions = useMemo(() => {
    if (layout.aspects.length) return layout.aspects;
    return DEFAULT_ASPECTS.map((a) => ({ ...a }));
  }, [layout.aspects]);

  const durationOptions = useMemo(() => {
    const list = durationsFromCapabilities(
      selectedModel?.capabilities ?? null,
    );
    return list.length ? list : [5, 8, 10];
  }, [selectedModel?.capabilities]);

  useEffect(() => {
    void api<PublicModel[]>("/models")
      .then((list) => setModels(list))
      .catch(() => toast.error("加载模型列表失败"));
  }, []);

  useEffect(() => {
    if (models.length === 0) return;
    setModelId((prev) => resolveModelId(models, kind, prev || null));
  }, [kind, models]);

  useEffect(() => {
    if (!aspectOptions.length) return;
    setRatio((prev) =>
      aspectOptions.some((a) => a.id === prev)
        ? prev
        : (aspectOptions[0]?.id ?? "1:1"),
    );
  }, [aspectOptions]);

  useEffect(() => {
    if (!durationOptions.length) return;
    setDuration((prev) =>
      durationOptions.includes(prev) ? prev : durationOptions[0]!,
    );
  }, [durationOptions]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await api<JobsPage>(`/jobs?take=${JOBS_PAGE}&scope=studio`);
      const items = res.items.filter(isStudioFeedJob);
      setJobs(items);
      for (const job of items) {
        if (isBusy(job.status)) {
          watchStudioGeneration(job.id, {
            kind: job.kind,
            modelName: job.modelName,
            prompt: job.input?.prompt,
          });
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载创作记录失败");
    } finally {
      setBootstrapped(true);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useJobLifecycle({
    getBusyJobIds: () =>
      jobsRef.current.filter((j) => isBusy(j.status)).map((j) => j.id),
    onProgress: (payload) => {
      if (!payload.jobId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === payload.jobId);
        if (idx < 0) {
          void loadJobs();
          return prev;
        }
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: payload.status ?? copy[idx].status,
          progress:
            typeof payload.progress === "number"
              ? payload.progress
              : copy[idx].progress,
        };
        return copy;
      });
    },
    onCompleted: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      const assets = (payload.assets ?? [])
        .filter((a): a is Asset => Boolean(a?.id && a?.url))
        .map((a) => ({ id: a.id, url: String(a.url), kind: a.kind }));
      let found = false;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        found = true;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: "succeeded",
          progress: 100,
          assets: assets.length ? assets : copy[idx].assets,
          error: null,
        };
        return copy;
      });
      if (!found || !assets.length) void loadJobs();
    },
    onFailed: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: payload.status === "cancelled" ? "cancelled" : "failed",
          error: payload.error ?? copy[idx].error,
        };
        return copy;
      });
    },
  });

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) {
      Toast.show({ content: "请选择图片", position: "center" });
      return;
    }
    const room = Math.max(0, MAX_REFS - refs.length);
    const slice = list.slice(0, room);
    if (!slice.length) {
      Toast.show({ content: `最多 ${MAX_REFS} 张参考图`, position: "center" });
      return;
    }

    const pending: LocalRef[] = slice.map((file) => ({
      localId: `ref_${crypto.randomUUID().slice(0, 8)}`,
      previewUrl: URL.createObjectURL(file),
      uploading: true,
    }));
    setRefs((prev) => [...prev, ...pending]);

    await Promise.all(
      pending.map(async (item, i) => {
        const file = slice[i]!;
        try {
          const asset = await apiUpload<{ id: string; url: string }>(
            "/upload",
            file,
          );
          setRefs((prev) =>
            prev.map((r) =>
              r.localId === item.localId
                ? { ...r, url: asset.url, uploading: false }
                : r,
            ),
          );
        } catch {
          setRefs((prev) => prev.filter((r) => r.localId !== item.localId));
          URL.revokeObjectURL(item.previewUrl);
          toast.error("参考图上传失败");
        }
      }),
    );
  }

  function removeRef(localId: string) {
    setRefs((prev) => {
      const hit = prev.find((r) => r.localId === localId);
      if (hit?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(hit.previewUrl);
      }
      return prev.filter((r) => r.localId !== localId);
    });
  }

  function remixJob(job: Job) {
    const nextKind = job.kind === "video" ? "video" : "image";
    setKind(nextKind);
    setPrompt(job.input?.prompt?.trim() || "");
    const urls = (job.input?.referenceUrls ?? []).filter((u) =>
      /^https?:\/\//i.test(u),
    );
    setRefs(
      urls.slice(0, MAX_REFS).map((url) => ({
        localId: `remix_${url.slice(-10)}`,
        previewUrl: url,
        url,
      })),
    );
    if (typeof job.input?.ratio === "string" && job.input.ratio) {
      setRatio(job.input.ratio);
    }
    if (typeof job.input?.n === "number" && job.input.n > 0) {
      setCount(job.input.n);
    }
    if (typeof job.input?.duration === "number" && job.input.duration > 0) {
      setDuration(job.input.duration);
    }
    if (job.input?.modelId) {
      setModelId(job.input.modelId);
    }
    Toast.show({ content: "已填入同款参数", position: "center" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const promptText = prompt.trim();
    if (!promptText) {
      Toast.show({ content: "请输入提示词", position: "center" });
      return;
    }
    if (!modelId) {
      Toast.show({ content: "请选择模型", position: "center" });
      return;
    }
    if (refs.some((r) => r.uploading)) {
      Toast.show({ content: "参考图上传中…", position: "center" });
      return;
    }

    const referenceUrls = refs
      .map((r) => r.url)
      .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(u)));

    setSubmitting(true);
    try {
      const input: Record<string, unknown> = {
        prompt: promptText,
        modelId,
        referenceUrls,
      };
      if (layout.showRatio || aspectOptions.length) {
        input.ratio = ratio;
        const aspect = aspectOptions.find((a) => a.id === ratio);
        if (aspect) {
          input.width = aspect.width;
          input.height = aspect.height;
        }
      }
      if (kind === "image") input.n = count;
      else input.duration = duration;

      const job = await api<Job>("/jobs", {
        method: "POST",
        body: { kind, input },
      });
      watchStudioGeneration(job.id, {
        kind,
        modelName: selectedModel?.name,
        prompt: promptText,
      });
      void ensureGenerationNotifyPermission();
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
      Toast.show({ content: "已提交生成", position: "center" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const ratioLabel =
    aspectOptions.find((a) => a.id === ratio)?.label ?? ratio;
  const canSubmit =
    Boolean(modelId) && !submitting && !refs.some((r) => r.uploading);

  return (
    <div className="joy-m-studio">
      <section className="joy-m-studio-composer">
        <div className="joy-m-studio-kind" role="tablist" aria-label="创作类型">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "image"}
            className={cn(
              "joy-m-studio-kind-btn",
              kind === "image" && "is-active",
            )}
            onClick={() => setKind("image")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/image-gen.svg"
              alt=""
              className="joy-m-studio-kind-ico"
              draggable={false}
            />
            生图
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "video"}
            className={cn(
              "joy-m-studio-kind-btn",
              kind === "video" && "is-active",
            )}
            onClick={() => setKind("video")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/video-gen.svg"
              alt=""
              className="joy-m-studio-kind-ico"
              draggable={false}
            />
            生视频
          </button>
        </div>

        <div className="joy-m-studio-prompt-wrap">
          <div className="joy-m-studio-ref-row">
            {refs.map((item) => (
              <span
                key={item.localId}
                className={cn(
                  "joy-m-studio-ref",
                  item.uploading && "is-loading",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" />
                {item.uploading ? (
                  <span className="joy-m-studio-ref-busy">
                    <DotLoading color="white" />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="joy-m-studio-ref-rm"
                    aria-label="移除参考图"
                    onClick={() => removeRef(item.localId)}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {refs.length < MAX_REFS ? (
              <button
                type="button"
                className="joy-m-studio-ref-add"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-5" strokeWidth={1.7} />
                <span>参考</span>
              </button>
            ) : null}
          </div>

          <TextArea
            className="joy-m-studio-prompt"
            placeholder={
              kind === "video"
                ? "描述画面运动、镜头与节奏…"
                : "简述主体、风格、光线与构图…"
            }
            value={prompt}
            onChange={setPrompt}
            rows={4}
            maxLength={2000}
            showCount
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div className="joy-m-studio-params">
          {(layout.showRatio || aspectOptions.length > 0) && (
            <button
              type="button"
              className="joy-m-studio-param"
              onClick={() => setParamOpen("ratio")}
            >
              <Ratio className="size-3.5" strokeWidth={1.8} />
              {ratioLabel}
            </button>
          )}
          {kind === "image" ? (
            <button
              type="button"
              className="joy-m-studio-param"
              onClick={() => setParamOpen("count")}
            >
              ×{count}
            </button>
          ) : (
            <button
              type="button"
              className="joy-m-studio-param"
              onClick={() => setParamOpen("duration")}
            >
              {duration}s
            </button>
          )}
        </div>
      </section>

      <div className="joy-m-studio-dock">
        <button
          type="button"
          className="joy-m-studio-model-chip"
          disabled={kindModels.length === 0}
          onClick={() => setModelOpen(true)}
        >
          {selectedIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selectedIcon}
              alt=""
              className="joy-m-studio-model-chip-icon"
              draggable={false}
            />
          ) : (
            <span className="joy-m-studio-model-chip-icon is-ph" aria-hidden />
          )}
          <span className="joy-m-studio-model-chip-text">
            <span className="joy-m-studio-model-chip-name">
              {selectedModel
                ? modelPrimary(selectedModel)
                : kindModels.length
                  ? "选择模型"
                  : "暂无模型"}
            </span>
            {selectedModel && modelSecondary(selectedModel) ? (
              <span className="joy-m-studio-model-chip-chan">
                {modelSecondary(selectedModel)}
              </span>
            ) : null}
          </span>
          <ChevronDown className="joy-m-studio-model-chip-caret" strokeWidth={2} />
        </button>

        <Button
          color="primary"
          className="joy-m-studio-submit"
          loading={submitting}
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          <span className="joy-m-studio-submit-inner">
            <WandSparkles className="size-4" strokeWidth={1.9} />
            生成
          </span>
        </Button>
      </div>

      <section className="joy-m-studio-feed">
        <div className="joy-m-studio-feed-head">
          <h3 className="joy-m-studio-feed-title">最近创作</h3>
          <span className="joy-m-studio-feed-count">
            {bootstrapped ? jobs.length : "…"}
          </span>
        </div>

        {!bootstrapped ? (
          <div className="joy-m-studio-grid is-skel" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="joy-m-studio-skel">
                <span className="joy-m-shimmer" aria-hidden />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <Empty
            description="还没有作品，先生成一张试试"
            className="joy-m-studio-empty"
          />
        ) : (
          <div className="joy-m-studio-grid">
            {jobs.map((job) => {
              const thumb = jobThumb(job);
              const busy = isBusy(job.status);
              const isVideo = job.kind === "video";
              const preview =
                job.assets?.[0]?.url &&
                !/\.(mp4|webm|mov)(\?|$)/i.test(job.assets[0].url)
                  ? job.assets[0].url
                  : thumb;
              return (
                <article
                  key={job.id}
                  className={cn(
                    "joy-m-studio-card",
                    job.status === "failed" && "is-fail",
                  )}
                >
                  <button
                    type="button"
                    className="joy-m-studio-card-media"
                    disabled={!preview && !busy}
                    onClick={() => {
                      if (preview) ImageViewer.show({ image: preview });
                    }}
                  >
                    {thumb ? (
                      <Image src={thumb} fit="cover" alt="" lazy />
                    ) : busy ? (
                      <span className="joy-m-studio-card-busy">
                        <DotLoading color="primary" />
                      </span>
                    ) : (
                      <span className="joy-m-studio-card-ph" />
                    )}
                    {isVideo ? (
                      <span className="joy-m-studio-card-play" aria-hidden>
                        <Play className="size-3" fill="currentColor" />
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "joy-m-studio-card-status",
                        busy && "is-busy",
                        job.status === "failed" && "is-fail",
                      )}
                    >
                      {busy && typeof job.progress === "number"
                        ? `${Math.round(job.progress)}%`
                        : statusLabel(job.status)}
                    </span>
                  </button>
                  <div className="joy-m-studio-card-foot">
                    <p className="joy-m-studio-card-prompt">
                      {shortPrompt(job.input?.prompt)}
                    </p>
                    <button
                      type="button"
                      className="joy-m-studio-card-remix"
                      aria-label="填入同款"
                      onClick={() => remixJob(job)}
                    >
                      <RefreshCw className="size-3.5" strokeWidth={2} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Popup
        visible={modelOpen}
        onMaskClick={() => setModelOpen(false)}
        onClose={() => setModelOpen(false)}
        position="bottom"
        bodyClassName="joy-m-studio-model-sheet"
        destroyOnClose
      >
        <div className="joy-m-studio-model-sheet-inner">
          <div className="joy-m-studio-model-sheet-handle" aria-hidden />
          <h3 className="joy-m-studio-model-sheet-title">选择模型</h3>
          <p className="joy-m-studio-model-sheet-sub">
            {kind === "video" ? "视频模型" : "图片模型"} · {kindModels.length}{" "}
            个
          </p>
          <div className="joy-m-studio-model-sheet-list">
            <CheckList
              value={modelId ? [modelId] : []}
              onChange={(v) => {
                const next = v[0];
                if (next) {
                  setModelId(String(next));
                  setModelOpen(false);
                }
              }}
            >
              {kindModels.map((m) => {
                const icon = modelIcon(m);
                return (
                  <CheckList.Item key={m.id} value={m.id}>
                    <div className="joy-m-studio-model-row">
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icon}
                          alt=""
                          className="joy-m-studio-model-row-icon"
                          draggable={false}
                        />
                      ) : (
                        <span
                          className="joy-m-studio-model-row-icon is-ph"
                          aria-hidden
                        />
                      )}
                      <div className="joy-m-studio-model-row-text">
                        <span className="joy-m-studio-model-row-name">
                          {modelPrimary(m)}
                        </span>
                        {modelSecondary(m) ? (
                          <span className="joy-m-studio-model-row-chan">
                            {modelSecondary(m)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </CheckList.Item>
                );
              })}
            </CheckList>
          </div>
        </div>
      </Popup>

      <Popup
        visible={paramOpen !== null}
        onMaskClick={() => setParamOpen(null)}
        onClose={() => setParamOpen(null)}
        position="bottom"
        bodyClassName="joy-m-studio-param-sheet"
        destroyOnClose
      >
        <div className="joy-m-studio-param-sheet-inner">
          <div className="joy-m-studio-model-sheet-handle" aria-hidden />
          <h3 className="joy-m-studio-model-sheet-title">
            {paramOpen === "ratio"
              ? "画面比例"
              : paramOpen === "count"
                ? "生成数量"
                : "视频时长"}
          </h3>
          <div className="joy-m-studio-param-options">
            {paramOpen === "ratio"
              ? aspectOptions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      ratio === a.id && "is-active",
                    )}
                    onClick={() => {
                      setRatio(a.id);
                      setParamOpen(null);
                    }}
                  >
                    {a.label}
                  </button>
                ))
              : null}
            {paramOpen === "count"
              ? IMAGE_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      count === n && "is-active",
                    )}
                    onClick={() => {
                      setCount(n);
                      setParamOpen(null);
                    }}
                  >
                    {n} 张
                  </button>
                ))
              : null}
            {paramOpen === "duration"
              ? durationOptions.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={cn(
                      "joy-m-studio-param-opt",
                      duration === d && "is-active",
                    )}
                    onClick={() => {
                      setDuration(d);
                      setParamOpen(null);
                    }}
                  >
                    {d} 秒
                  </button>
                ))
              : null}
          </div>
        </div>
      </Popup>
    </div>
  );
}
