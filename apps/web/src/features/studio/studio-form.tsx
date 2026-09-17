"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import {
  Copy,
  Download,
  Expand,
  RefreshCw,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { copyText } from "@/shared/lib/clipboard";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { getJobsSocket } from "@/shared/lib/socket";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import {
  GeneratingStatusBar,
  GeneratingThumb,
} from "@/features/studio/generating-thumb";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import "./studio-workspace.css";

const CreationComposer = dynamic(
  () =>
    import("@/features/studio/creation-composer").then((m) => m.CreationComposer),
  {
    ssr: false,
    loading: () => (
      <div className="h-40 animate-pulse rounded-[28px] bg-muted/40" />
    ),
  },
);

type Asset = { id: string; url: string; kind?: string };

type JobInput = {
  prompt?: string;
  width?: number;
  height?: number;
  n?: number;
  ratio?: string;
  size?: string;
  resolution?: string;
  duration?: number;
  modelId?: string;
  referenceAssetIds?: string[];
  referenceUrls?: string[];
};

type Job = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  modelName?: string | null;
  channelName?: string | null;
  platform?: string | null;
  input?: JobInput;
  assets?: Asset[];
  error?: string | null;
};

/** 生成时间：优先完成时间，否则创建时间 */
function jobTimeIso(job: Pick<Job, "createdAt" | "finishedAt">) {
  return job.finishedAt || job.createdAt;
}

function jobTimeMs(job: Pick<Job, "createdAt" | "finishedAt">) {
  const ms = Date.parse(jobTimeIso(job));
  return Number.isFinite(ms) ? ms : 0;
}

function formatJobTime(iso: string) {
  const d = dayjs(iso);
  if (!d.isValid()) return null;
  const now = dayjs();
  if (d.isSame(now, "day")) return d.format("今天 HH:mm");
  if (d.isSame(now.subtract(1, "day"), "day")) return d.format("昨天 HH:mm");
  if (d.isSame(now, "year")) return d.format("M月D日 HH:mm");
  return d.format("YYYY/MM/DD HH:mm");
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function formatRatioLabel(ratio?: string | null) {
  if (!ratio) return null;
  const key = ratio.trim().toLowerCase();
  if (key === "auto") return "自动";
  if (key === "adaptive" || key === "keep") return "自适应";
  return ratio.trim();
}

function aspectLabel(input?: JobInput) {
  const fromRatio = formatRatioLabel(input?.ratio);
  if (fromRatio) return fromRatio;
  const w = input?.width;
  const h = input?.height;
  if (!w || !h) return null;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function qualityLabel(input?: JobInput) {
  const raw = input?.resolution?.trim() || input?.size?.trim();
  if (raw) {
    if (/^\d+\s*[x×]\s*\d+$/i.test(raw)) {
      const m = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
      if (m) {
        const long = Math.max(Number(m[1]), Number(m[2]));
        if (long >= 3500) return "4K";
        if (long >= 2800) return "3K";
        if (long >= 1400) return "2K";
        if (long >= 900) return "1K";
      }
      return raw.replace(/\s+/g, "");
    }
    return raw.replace(/p$/i, "P").replace(/k$/i, "K");
  }
  const max = Math.max(input?.width ?? 0, input?.height ?? 0);
  if (max >= 3500) return "4K";
  if (max >= 2800) return "3K";
  if (max >= 1400) return "2K";
  if (max >= 900) return "1K";
  return null;
}

/**
 * 参考 Jimeng 风格：模型 | 清晰度 | 比例 | … | 时间
 * 可按任务类型扩展更多字段。
 */
function jobStartMs(job: Job) {
  const raw = job.startedAt || job.createdAt;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : Date.now();
}

/** Live elapsed while busy: tick from 0s upward (no ms flicker). */
function formatLiveElapsed(ms: number) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem > 0 ? `${min}分${rem}秒` : `${min}分`;
  const hour = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hour}小时${remMin}分` : `${hour}小时`;
}

function jobElapsedLabel(job: Job, now: number) {
  if (isBusy(job.status)) {
    return `用时 ${formatLiveElapsed(now - jobStartMs(job))}`;
  }
  if (job.durationMs == null || !Number.isFinite(job.durationMs)) return null;
  const label = formatDurationMs(job.durationMs);
  return label === "—" ? null : `用时 ${label}`;
}

/**
 * 参考 Jimeng 风格：模型 | 清晰度 | 比例 | … | 时间
 * 可按任务类型扩展更多字段。
 */
function jobMetaParts(job: Job, assetCount = 0, now = Date.now()): string[] {
  const input = job.input;
  const model =
    job.modelName?.trim() ||
    job.channelName?.trim() ||
    (job.kind === "video" ? "视频生成" : "图片生成");
  const resolution = qualityLabel(input);
  // HappyHorse 图生等：比例跟首帧，meta 不展示易误导的 ratio
  const followSourceAspect =
    Boolean(input?.referenceUrls?.length) &&
    (job.modelName?.includes("图生") ||
      job.modelName?.toLowerCase().includes("i2v"));
  const ratio = followSourceAspect ? null : aspectLabel(input);
  const count =
    job.kind === "image" && (input?.n ?? assetCount) > 1
      ? `${input?.n ?? assetCount}张`
      : null;
  const clipDuration =
    job.kind === "video" && input?.duration
      ? `${input.duration}s`
      : null;
  const time = formatJobTime(jobTimeIso(job));
  const elapsedLabel = jobElapsedLabel(job, now);

  return [
    model,
    resolution,
    ratio,
    count,
    clipDuration,
    job.channelName &&
    job.modelName &&
    job.channelName.trim() !== job.modelName.trim()
      ? job.channelName.trim()
      : null,
    time,
    elapsedLabel,
  ].filter((p): p is string => Boolean(p));
}

function isBusy(status: string) {
  return status === "queued" || status === "running" || status === "polling";
}

function isVideoAsset(asset: Asset) {
  return (
    asset.kind === "video" ||
    Boolean(asset.url.match(/\.(mp4|webm|mov)(\?|$)/i))
  );
}

function aspectCss(input?: JobInput): string {
  const w = input?.width;
  const h = input?.height;
  if (w && h && w > 0 && h > 0) return `${w} / ${h}`;
  const ratio = input?.ratio?.trim();
  if (ratio?.includes(":")) {
    const [a, b] = ratio.split(":").map(Number);
    if (a > 0 && b > 0) return `${a} / ${b}`;
  }
  // auto / adaptive / missing → square placeholder (video may refine from metadata)
  return "1 / 1";
}

function refMediaKind(url: string): "image" | "video" | "audio" | "other" {
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return "audio";
  if (/\.(png|jpe?g|webp|gif|bmp|avif)(\?|$)/i.test(url)) return "image";
  // uploaded assets often lack extensions — treat as image for thumb strip
  return "image";
}

function jobReferenceUrls(input?: JobInput): string[] {
  const urls = input?.referenceUrls ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

const JOBS_PAGE = 30;

type JobsPage = { items: Job[]; hasMore: boolean };

/** 早 → 晚（对话流：早的在上） */
function sortJobsAsc(list: Job[]) {
  return [...list].sort((a, b) => {
    const d = jobTimeMs(a) - jobTimeMs(b);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function mergeJobsAsc(prev: Job[], incoming: Job[]) {
  const map = new Map<string, Job>();
  for (const j of prev) map.set(j.id, j);
  for (const j of incoming) map.set(j.id, j);
  return sortJobsAsc([...map.values()]);
}

function getAppScrollViewport(): HTMLElement | null {
  return document.querySelector(
    "[data-app-shell] main [data-radix-scroll-area-viewport]",
  );
}

function scrollFeedToBottom() {
  const vp = getAppScrollViewport();
  if (!vp) return;
  vp.scrollTop = vp.scrollHeight;
}

async function downloadAsset(url: string, kind?: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `joyai-${Date.now()}.${extForAsset(url, blob.type, kind)}`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function extForAsset(url: string, mime: string, kind?: string) {
  if (kind === "video" || mime.startsWith("video/")) {
    if (mime.includes("webm")) return "webm";
    if (mime.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("gif")) return "gif";
  const fromUrl = url.match(/\.(mp4|webm|mov|png|jpe?g|webp|gif)(?:\?|$)/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase() === "jpeg" ? "jpg" : fromUrl.toLowerCase();
  return kind === "video" ? "mp4" : "png";
}

/** 默认 2 行省略；展开为浮层，不挤占下方文档流 */
function StudioPrompt({
  text,
  onCopy,
  onUse,
}: {
  text: string;
  onCopy?: () => void;
  onUse?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const clampRef = useRef<HTMLParagraphElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [text]);

  useEffect(() => {
    const el = clampRef.current;
    if (!el) return;
    const measure = () => {
      setOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const canAct = Boolean(text.trim()) && text !== "未命名创作";

  return (
    <div ref={wrapRef} className="joy-studio-prompt-wrap">
      <p
        ref={clampRef}
        className={cn(
          "joy-studio-prompt is-clamp",
          (overflow || canAct) && "is-overflow",
          open && "is-open-anchor",
        )}
        title={
          overflow
            ? "点击展开全文"
            : canAct
              ? "点击查看操作"
              : undefined
        }
        onClick={() => {
          if (overflow || canAct) setOpen((v) => !v);
        }}
      >
        {text}
      </p>
      {open ? (
        <div className="joy-studio-prompt-pop" role="dialog" aria-label="完整提示词">
          <p className="joy-studio-prompt-pop-text">{text}</p>
          <div className="joy-studio-prompt-pop-actions">
            {canAct ? (
              <>
                <button
                  type="button"
                  className="joy-studio-prompt-tool"
                  onClick={() => onCopy?.()}
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  className="joy-studio-prompt-tool"
                  onClick={() => {
                    onUse?.();
                    setOpen(false);
                  }}
                >
                  <WandSparkles className="h-3.5 w-3.5" />
                  使用提示词
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="joy-studio-prompt-pop-close"
              onClick={() => setOpen(false)}
            >
              收起
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudioJobRefs({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;
  return (
    <div
      className={cn("joy-studio-refs", shown.length > 1 && "is-stack")}
      aria-label="参考素材"
    >
      {shown.map((url, i) => {
        const kind = refMediaKind(url);
        const thumb = (
          <div
            className={cn("joy-studio-ref-thumb", `is-${kind}`)}
            style={shown.length > 1 ? { zIndex: shown.length - i } : undefined}
            title={`参考${i + 1}`}
          >
            {kind === "video" ? (
              <video src={url} muted playsInline preload="metadata" />
            ) : kind === "audio" ? (
              <span className="joy-studio-ref-audio">音</span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`参考${i + 1}`} />
            )}
            <span className="joy-studio-ref-index">{i + 1}</span>
          </div>
        );
        return kind === "image" || kind === "other" ? (
          <PhotoView key={`${url}-${i}`} src={url}>
            <button type="button" className="joy-studio-ref-hit" aria-label={`预览参考${i + 1}`}>
              {thumb}
            </button>
          </PhotoView>
        ) : (
          <div key={`${url}-${i}`} className="joy-studio-ref-hit">
            {thumb}
          </div>
        );
      })}
      {extra > 0 ? (
        <span className="joy-studio-ref-more">+{extra}</span>
      ) : null}
    </div>
  );
}

/** Landscape wider; portrait height-capped but keep ≥200px wide for chrome. */
function frameStyleForAspect(aspect: string): CSSProperties {
  const maxW = 360;
  const maxH = 380;
  const minW = 200;
  const parts = aspect.split("/").map((s) => Number(s.trim()));
  const aw = parts[0];
  const ah = parts[1];
  if (!(aw > 0 && ah > 0)) {
    return { aspectRatio: aspect, width: Math.min(maxW, 280) };
  }
  const heightAtMaxW = (maxW * ah) / aw;
  if (heightAtMaxW <= maxH) {
    return { aspectRatio: `${aw} / ${ah}`, width: maxW };
  }
  const widthAtMaxH = (maxH * aw) / ah;
  return {
    aspectRatio: `${aw} / ${ah}`,
    width: Math.min(maxW, Math.max(minW, widthAtMaxH)),
  };
}

/** Video frame that can adopt intrinsic aspect for adaptive/auto jobs. */
function StudioVideoThumb({
  src,
  fallbackAspect,
  flexible,
}: {
  src: string;
  fallbackAspect: string;
  flexible: boolean;
}) {
  const [aspect, setAspect] = useState(fallbackAspect);

  useEffect(() => {
    setAspect(fallbackAspect);
  }, [fallbackAspect, src]);

  const frameStyle = useMemo(
    () => frameStyleForAspect(aspect),
    [aspect],
  );

  return (
    <div
      className="joy-studio-thumb joy-studio-thumb-video"
      style={frameStyle}
    >
      <StudioPlyrPlayer
        src={src}
        onNaturalAspect={
          flexible
            ? (next) => {
                setAspect((prev) => (prev === next ? prev : next));
              }
            : undefined
        }
      />
    </div>
  );
}

function JobActions({
  job,
  regeneratingId,
  deletingId,
  onRegenerate,
  onDelete,
}: {
  job: Job;
  regeneratingId: string | null;
  deletingId: string | null;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  const assets = job.assets ?? [];
  const canDownload = assets.length > 0;

  async function onDownload() {
    if (!canDownload) {
      toast.error("暂无可下载资产");
      return;
    }
    try {
      for (const asset of assets) {
        await downloadAsset(
          asset.url,
          isVideoAsset(asset) ? "video" : asset.kind,
        );
      }
      toast.success(assets.length > 1 ? "已开始下载全部资产" : "已开始下载");
    } catch {
      toast.error("下载失败");
    }
  }

  return (
    <div className="joy-studio-actions">
      <button
        type="button"
        className="joy-studio-action"
        disabled={regeneratingId === job.id || !job.input?.prompt}
        onClick={onRegenerate}
      >
        <RefreshCw
          strokeWidth={1.75}
          className={cn(
            "h-3.5 w-3.5",
            regeneratingId === job.id && "animate-spin",
          )}
        />
        再次生成
      </button>
      <button
        type="button"
        className="joy-studio-action"
        disabled={!canDownload}
        onClick={() => void onDownload()}
      >
        <Download strokeWidth={1.75} className="h-3.5 w-3.5" />
        下载
      </button>
      <button
        type="button"
        className="joy-studio-action-icon is-danger"
        aria-label="删除"
        disabled={deletingId === job.id}
        onClick={onDelete}
      >
        <Trash2 strokeWidth={1.75} className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function StudioInner() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [remixKey, setRemixKey] = useState(0);
  const [remixPrompt, setRemixPrompt] = useState<string | undefined>();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const jobsRef = useRef<Job[]>([]);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const loadInitial = useCallback(async () => {
    const res = await api<JobsPage>(`/jobs?take=${JOBS_PAGE}`);
    setJobs(sortJobsAsc(res.items));
    setHasMore(res.hasMore);
    stickToBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollFeedToBottom();
      requestAnimationFrame(scrollFeedToBottom);
    });
  }, []);

  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    const current = jobsRef.current;
    if (current.length === 0) return;

    const oldest = current[0];
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const viewport = getAppScrollViewport();
    const prevHeight = viewport?.scrollHeight ?? 0;
    const prevTop = viewport?.scrollTop ?? 0;

    try {
      const qs = new URLSearchParams({
        take: String(JOBS_PAGE),
        before: jobTimeIso(oldest),
        beforeId: oldest.id,
      });
      const res = await api<JobsPage>(`/jobs?${qs}`);
      if (res.items.length === 0) {
        setHasMore(false);
        return;
      }
      setJobs((prev) => mergeJobsAsc(prev, res.items));
      setHasMore(res.hasMore);
      requestAnimationFrame(() => {
        if (!viewport) return;
        const delta = viewport.scrollHeight - prevHeight;
        viewport.scrollTop = prevTop + delta;
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载更早记录失败");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const refreshLatest = useCallback(async () => {
    const res = await api<JobsPage>(`/jobs?take=${JOBS_PAGE}`);
    setJobs((prev) => mergeJobsAsc(prev, res.items));
    if (stickToBottomRef.current) {
      requestAnimationFrame(scrollFeedToBottom);
    }
  }, []);

  useEffect(() => {
    void loadInitial();
    const socket = getJobsSocket();
    const refresh = () => void refreshLatest();
    const onAssetUpdated = (payload: {
      asset?: Asset;
      jobId?: string | null;
    }) => {
      const next = payload.asset;
      if (!next?.id || !next.url) return;
      setJobs((prev) =>
        prev.map((job) => {
          if (!job.assets?.some((a) => a.id === next.id)) return job;
          return {
            ...job,
            assets: job.assets.map((a) =>
              a.id === next.id ? { ...a, url: next.url } : a,
            ),
          };
        }),
      );
    };
    socket.on("job:completed", refresh);
    socket.on("job:failed", refresh);
    socket.on("job:progress", refresh);
    socket.on("asset:updated", onAssetUpdated);
    return () => {
      socket.off("job:completed", refresh);
      socket.off("job:failed", refresh);
      socket.off("job:progress", refresh);
      socket.off("asset:updated", onAssetUpdated);
    };
  }, [loadInitial, refreshLatest]);

  const hasJobs = jobs.length > 0;
  const hasBusyJobs = jobs.some((j) => isBusy(j.status));

  // 进行中任务：每秒从 0s 起跳累计用时
  useEffect(() => {
    if (!hasBusyJobs) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasBusyJobs]);

  // 向上滚到顶部 → 加载更早
  useEffect(() => {
    if (!hasJobs) return;
    const sentinel = topSentinelRef.current;
    const root = getAppScrollViewport();
    if (!sentinel || !root) return;

    const onScroll = () => {
      const distanceFromBottom =
        root.scrollHeight - root.scrollTop - root.clientHeight;
      stickToBottomRef.current = distanceFromBottom < 120;
    };
    root.addEventListener("scroll", onScroll, { passive: true });

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadOlder();
        }
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => {
      root.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [loadOlder, hasJobs]);

  function applyPrompt(job: Job) {
    const prompt = job.input?.prompt?.trim();
    if (!prompt) {
      toast.error("没有可用的提示词");
      return;
    }
    setRemixPrompt(prompt);
    setRemixKey((k) => k + 1);
    toast.message("已填入提示词，可继续修改后生成");
    requestAnimationFrame(() => {
      document
        .querySelector(".joy-studio-dock")
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  async function copyPrompt(job: Job) {
    const prompt = job.input?.prompt?.trim();
    if (!prompt) {
      toast.error("没有可复制的提示词");
      return;
    }
    if (await copyText(prompt)) {
      toast.success("提示词已复制");
    } else {
      toast.error("复制失败，请手动选择文本");
    }
  }

  async function regenerate(job: Job) {
    if (!job.input?.prompt) {
      toast.error("无法再次生成");
      return;
    }
    setRegeneratingId(job.id);
    try {
      await api("/jobs", {
        method: "POST",
        body: {
          kind: job.kind,
          input: job.input,
        },
      });
      toast.success("已再次提交生成");
      stickToBottomRef.current = true;
      await refreshLatest();
      requestAnimationFrame(scrollFeedToBottom);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "再次生成失败");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function removeJob(job: Job) {
    const ok = await confirmDialog({
      title: "删除这条创作记录？",
      description: "仅从创作页移除记录，资产库中的文件仍会保留。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(job.id);
    try {
      await api(`/jobs/${job.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  const feed = useMemo(() => jobs, [jobs]);

  return (
    <div className="joy-studio">
      <div className="joy-studio-top">
        <Link href="/assets" className="joy-studio-assets-btn">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={JOYAI_BRAND.nav.assets}
            alt=""
            className="h-4 w-4 object-contain dark:brightness-0 dark:invert"
            draggable={false}
          />
          创作资产
        </Link>
      </div>

      {!hasJobs ? (
        <div className="joy-studio-empty">
          <Sparkles className="mb-1 h-8 w-8 text-muted-foreground/50" />
          <h2>开始你的创作</h2>
          <p>在下方输入想法，或去灵感页找同款继续发挥</p>
          <button
            type="button"
            className="joy-studio-empty-link"
            onClick={() => router.push("/inspire")}
          >
            去灵感广场
          </button>
        </div>
      ) : (
        <div className="joy-studio-feed">
          <div
            ref={topSentinelRef}
            className="joy-studio-feed-top"
            aria-hidden
          >
            {loadingMore ? (
              <span className="joy-studio-feed-loading">加载中…</span>
            ) : null}
          </div>
          <PhotoProvider>
            {feed.map((job) => {
              const assets = job.assets ?? [];
              const busy = isBusy(job.status);
              const metaParts = jobMetaParts(job, assets.length, now);
              const skeletonCount = Math.min(
                Math.max(job.input?.n ?? (job.kind === "image" ? 2 : 1), 1),
                4,
              );
              const ar = aspectCss(job.input);
              const refUrls = jobReferenceUrls(job.input);
              const gridCount =
                assets.length > 0 ? assets.length : skeletonCount;

              const isVideoJob =
                job.kind === "video" || assets.some((a) => isVideoAsset(a));

              return (
                <article
                  key={job.id}
                  className={cn("joy-studio-job", isVideoJob && "is-video")}
                >
                  <div className="joy-studio-prompt-block">
                    <div
                      className={cn(
                        "joy-studio-prompt-row",
                        refUrls.length > 0 && "has-refs",
                      )}
                    >
                      <StudioJobRefs urls={refUrls} />
                      <div className="joy-studio-prompt-col">
                        <StudioPrompt
                          text={job.input?.prompt || "未命名创作"}
                          onCopy={() => void copyPrompt(job)}
                          onUse={() => applyPrompt(job)}
                        />
                        {metaParts.length > 0 ? (
                          <p className="joy-studio-meta joy-studio-meta-sub">
                            {metaParts.map((part, i) => (
                              <span key={`${job.id}-meta-${i}`}>
                                {i > 0 ? (
                                  <span className="joy-studio-meta-sep" aria-hidden>
                                    {" "}
                                    |{" "}
                                  </span>
                                ) : null}
                                <span className="joy-studio-meta-part">{part}</span>
                              </span>
                            ))}
                          </p>
                        ) : null}
                        {job.error ? (
                          <p className="joy-studio-error">{job.error}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {assets.length > 0 ? (
                    <div
                      className={cn(
                        "joy-studio-grid",
                        gridCount === 1 && "is-single",
                        gridCount >= 2 && "is-multi",
                        isVideoJob && "is-video",
                      )}
                    >
                      {assets.map((asset) =>
                        isVideoAsset(asset) ? (
                          <StudioVideoThumb
                            key={asset.id}
                            src={asset.url}
                            fallbackAspect={ar}
                            // Always adopt decoded video size — i2v follows first frame,
                            // so UI-selected ratio may not match actual output.
                            flexible
                          />
                        ) : (
                          <div
                            key={asset.id}
                            className="joy-studio-thumb-frame"
                            style={{ aspectRatio: ar }}
                          >
                            <PhotoView src={asset.url}>
                              <button
                                type="button"
                                className="joy-studio-thumb-preview"
                                aria-label="预览图片"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={asset.url} alt="" />
                              </button>
                            </PhotoView>
                            <div className="joy-studio-thumb-hover">
                              <div className="joy-studio-thumb-hover-top">
                                <button
                                  type="button"
                                  className="joy-studio-thumb-tool"
                                  aria-label="预览"
                                  title="预览"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    (
                                      e.currentTarget
                                        .closest(".joy-studio-thumb-frame")
                                        ?.querySelector(
                                          ".joy-studio-thumb-preview",
                                        ) as HTMLButtonElement | null
                                    )?.click();
                                  }}
                                >
                                  <Expand className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="joy-studio-thumb-tool"
                                  aria-label="下载"
                                  title="下载"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void downloadAsset(asset.url, asset.kind);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  ) : busy ? (
                    <div className="joy-studio-generating">
                      <div
                        className={cn(
                          "joy-studio-grid",
                          gridCount === 1 && "is-single",
                          gridCount >= 2 && "is-multi",
                          isVideoJob && "is-video",
                        )}
                      >
                        {Array.from({ length: skeletonCount }).map((_, i) => (
                          <GeneratingThumb
                            key={`${job.id}-sk-${i}`}
                            aspectRatio={ar}
                            style={
                              isVideoJob
                                ? frameStyleForAspect(ar)
                                : { aspectRatio: ar, width: "100%" }
                            }
                          />
                        ))}
                      </div>
                      <GeneratingStatusBar
                        status={job.status}
                        kind={isVideoJob ? "video" : "image"}
                      />
                    </div>
                  ) : null}

                  <JobActions
                    job={job}
                    regeneratingId={regeneratingId}
                    deletingId={deletingId}
                    onRegenerate={() => void regenerate(job)}
                    onDelete={() => void removeJob(job)}
                  />
                </article>
              );
            })}
          </PhotoProvider>
        </div>
      )}

      <div className="joy-studio-dock">
        <div className="joy-studio-dock-glow" aria-hidden />
        <div className="joy-studio-dock-inner">
          <CreationComposer
            key={`dock-${remixKey}`}
            variant="dock"
            promptSeed={remixPrompt}
            onSubmitted={() => {
              stickToBottomRef.current = true;
              void refreshLatest().then(() => {
                requestAnimationFrame(scrollFeedToBottom);
              });
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function StudioForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">
          加载中…
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}
