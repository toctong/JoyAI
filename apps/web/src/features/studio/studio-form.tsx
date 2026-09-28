"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type CSSProperties,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoView, JoyPhotoProvider } from "@/shared/ui/joy-photo-preview";
import { downloadAsset } from "@/shared/lib/download-asset";
import {
  Copy,
  Download,
  FolderOpen,
  ImagePlus,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Sparkles,
  Trash2,
  WandSparkles,
  ChevronsDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NavSvgIcon } from "@/shared/ui/nav-svg-icon";
import {
  CanvasIconAudio,
  CanvasIconBrush,
  CanvasIconFrame,
  CanvasIconGrid,
  CanvasIconOutpaint,
  CanvasIconPanorama,
  CanvasIconScissors,
  CanvasIconWand,
} from "@/features/canvas/icons/canvas-icons";
import {
  captureStudioFrame,
  commitStudioImagePieces,
  extractStudioAudio,
  openAssetInNewCanvas,
  submitAngleJob,
  submitInpaintJob,
  submitOutpaintJob,
  submitPanoramaJob,
  trimStudioVideo,
  type StudioLocalTool,
  type StudioMediaAsset,
} from "@/features/studio/studio-asset-actions";
import {
  ImageToolDialog,
  type ImageToolMode,
} from "@/features/canvas/image-tool-dialog";
import { MaskEditDialog } from "@/features/canvas/mask-edit-dialog";
import { ImageAngleDialog } from "@/features/canvas/image-angle-dialog";
import { AudioTrimDialog } from "@/features/canvas/audio-trim-dialog";
import type { ImageAngleParams } from "@/features/canvas/lib/angle-prompt";
import type { RasterPiece } from "@/features/canvas/lib/image-raster";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import { copyText } from "@/shared/lib/clipboard";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { ensureGenerationNotifyPermission } from "@/shared/lib/generation-notify";
import { watchStudioGeneration } from "@/shared/lib/studio-generation-notify-host";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { cn } from "@/shared/lib/utils";
import {
  FailedThumb,
  GeneratingStatusBar,
  GeneratingThumb,
} from "@/features/studio/generating-thumb";
import { StudioPlyrPlayer } from "@/features/studio/studio-plyr-player";
import { useDisplayMediaUrl } from "@/shared/ui/joy-remote-img";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { JoyVideoPoster } from "@/shared/ui/joy-video-poster";
import { tosVideoPosterUrl } from "@/shared/lib/media-url";
import {
  splitPromptForDisplay,
  type PromptDisplayPart,
} from "@/features/ai-prompt";
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

type Asset = {
  id: string;
  url: string;
  kind?: string;
  meta?: { originalName?: string | null } | null;
};

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
  localEdit?: boolean;
  localTool?: string;
  layout?: { rows?: number; cols?: number };
};

type JobSlotFailure = { index: number; error: string };

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
  canvasProjectId?: string | null;
  input?: JobInput & {
    canvasProjectId?: string;
    manjuProjectId?: string;
    toolSlug?: string;
  };
  result?: {
    assetIds?: string[];
    urls?: string[];
    requested?: number;
    failures?: JobSlotFailure[];
    layout?: { rows?: number; cols?: number };
    tiles?: Array<{ assetId?: string; row?: number; col?: number }>;
  } | null;
  assets?: Asset[];
  error?: string | null;
};

/** Prefer `result.tiles` / `result.assetIds` so 切图 tiles stay row-major. */
function jobOutputAssets(job: Job): Asset[] {
  const assets = job.assets ?? [];
  if (!assets.length) return assets;

  const byTiles = orderAssetsByTiles(assets, job.result?.tiles);
  if (byTiles) return byTiles;

  const ids = (job.result?.assetIds ?? [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered: Asset[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const hit = byId.get(id);
    if (!hit || seen.has(id)) continue;
    ordered.push(hit);
    seen.add(id);
  }
  for (const a of assets) {
    if (!seen.has(a.id)) ordered.push(a);
  }
  return orderSplitAssetsByName(ordered);
}

function orderAssetsByTiles(
  assets: Asset[],
  tilesRaw?: Array<{ assetId?: string; row?: number; col?: number }> | null,
): Asset[] | null {
  if (!tilesRaw?.length) return null;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const scored: { asset: Asset; row: number; col: number; index: number }[] =
    [];
  for (let index = 0; index < tilesRaw.length; index += 1) {
    const tile = tilesRaw[index]!;
    const assetId = String(tile.assetId ?? "").trim();
    const row = Math.floor(Number(tile.row));
    const col = Math.floor(Number(tile.col));
    const asset = byId.get(assetId);
    if (!asset || !Number.isFinite(row) || !Number.isFinite(col)) continue;
    scored.push({ asset, row, col, index });
  }
  if (scored.length < 2) return null;
  const ordered = [...scored]
    .sort((a, b) => a.row - b.row || a.col - b.col || a.index - b.index)
    .map((s) => s.asset);
  const seen = new Set(ordered.map((a) => a.id));
  for (const a of assets) {
    if (!seen.has(a.id)) ordered.push(a);
  }
  return ordered;
}

/** Repair scrambled 切图 order using framerally-/joyai-split-R-C filenames when present. */
function orderSplitAssetsByName(assets: Asset[]): Asset[] {
  if (assets.length < 2) return assets;
  const scored: {
    asset: Asset;
    index: number;
    row: number;
    col: number;
  }[] = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]!;
    const name = `${asset.meta?.originalName ?? ""} ${asset.url ?? ""}`;
    const match = name.match(/(?:framerally|joyai)-split-(\d+)-(\d+)/i);
    if (!match) return assets;
    scored.push({
      asset,
      index,
      row: Number(match[1]) - 1,
      col: Number(match[2]) - 1,
    });
  }
  return scored
    .sort((a, b) => a.row - b.row || a.col - b.col || a.index - b.index)
    .map((s) => s.asset);
}

function inferSplitLayout(count: number): { rows: number; cols: number } | null {
  if (count < 2) return null;
  const root = Math.sqrt(count);
  if (Number.isInteger(root) && root >= 2) {
    return { rows: root, cols: root };
  }
  for (let cols = Math.min(6, count); cols >= 2; cols -= 1) {
    if (count % cols === 0) {
      return { rows: count / cols, cols };
    }
  }
  return { rows: 1, cols: count };
}

function isSplitJob(job: Job) {
  const prompt = String(job.input?.prompt ?? "").trim();
  return (
    job.input?.localTool === "split" ||
    prompt === "切图" ||
    prompt.startsWith("切图 ")
  );
}

/** 切图：按行列拼成一张整体（无缝网格）. */
function jobMosaicLayout(
  job: Job,
  assetCount: number,
): { rows: number; cols: number } | null {
  if (assetCount < 2) return null;

  const fromInput = job.input?.layout;
  const fromResult = job.result?.layout;
  const storedRows = Math.floor(Number(fromInput?.rows ?? fromResult?.rows));
  const storedCols = Math.floor(Number(fromInput?.cols ?? fromResult?.cols));
  const stored =
    Number.isFinite(storedRows) &&
    Number.isFinite(storedCols) &&
    storedRows >= 1 &&
    storedCols >= 1 &&
    storedRows * storedCols >= 2
      ? { rows: storedRows, cols: storedCols }
      : null;

  const split = isSplitJob(job);
  if (stored) {
    if (!split || stored.rows * stored.cols === assetCount) {
      return stored;
    }
  }
  if (!split) return null;
  return inferSplitLayout(assetCount);
}

type JobDisplaySlot =
  | { kind: "asset"; asset: Asset; index: number }
  | { kind: "failed"; error: string; index: number };

/**
 * Build grid slots so multi-n keeps successes and shows failed cards for
 * per-batch upstream errors (not one blank “all failed” row).
 */
function jobDisplaySlots(job: Job, assets: Asset[]): JobDisplaySlot[] {
  const failures = Array.isArray(job.result?.failures)
    ? job.result!.failures!
    : [];
  const failByIndex = new Map<number, string>();
  for (const f of failures) {
    if (!Number.isFinite(f?.index)) continue;
    failByIndex.set(
      Math.floor(f.index),
      String(f.error || "").trim() || "生成失败",
    );
  }

  const requestedRaw =
    job.result?.requested ??
    job.input?.n ??
    (assets.length || failByIndex.size || (job.status === "failed" ? 1 : 0));
  const requested = Math.min(Math.max(Number(requestedRaw) || 0, 0), 4);

  if (!requested && !assets.length && job.status !== "failed") return [];

  const n = Math.max(
    requested,
    assets.length + failByIndex.size,
    job.status === "failed" && !assets.length
      ? Math.min(Math.max(job.input?.n ?? 1, 1), 4)
      : 0,
  );
  if (n <= 0) return [];

  const queue = [...assets];
  const slots: JobDisplaySlot[] = [];
  for (let i = 0; i < n; i++) {
    if (failByIndex.has(i)) {
      slots.push({
        kind: "failed",
        error: failByIndex.get(i)!,
        index: i,
      });
      continue;
    }
    if (queue.length) {
      slots.push({ kind: "asset", asset: queue.shift()!, index: i });
      continue;
    }
    if (job.status === "failed") {
      slots.push({
        kind: "failed",
        error: String(job.error || "").trim() || "生成失败",
        index: i,
      });
    }
  }
  while (queue.length) {
    slots.push({
      kind: "asset",
      asset: queue.shift()!,
      index: slots.length,
    });
  }
  return slots;
}

function isStudioFeedJob(job: Job) {
  if (job.canvasProjectId) return false;
  if (job.input?.canvasProjectId) return false;
  if (job.input?.manjuProjectId) return false;
  if (job.input?.toolSlug) return false;
  return job.kind === "image" || job.kind === "video";
}

/** 创建时间（列表排序 / 翻页游标用，保持点击生成顺序） */
function jobCreatedIso(job: Pick<Job, "createdAt">) {
  return job.createdAt;
}

function jobCreatedMs(job: Pick<Job, "createdAt">) {
  const ms = Date.parse(jobCreatedIso(job));
  return Number.isFinite(ms) ? ms : 0;
}

/** 展示用时间：优先完成时间 */
function jobDisplayIso(job: Pick<Job, "createdAt" | "finishedAt">) {
  return job.finishedAt || job.createdAt;
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
  // 图生跟首帧：meta 不展示易误导的 ratio（HappyHorse / Kling Turbo 等）
  const hasRefs =
    Boolean(input?.referenceUrls?.length) ||
    Boolean(input?.referenceAssetIds?.length);
  const name = (job.modelName ?? "").toLowerCase();
  const followSourceAspect =
    hasRefs &&
    (job.modelName?.includes("图生") ||
      name.includes("i2v") ||
      name.includes("kling 3.0 turbo") ||
      name.includes("kling-3.0-turbo"));
  const ratio = followSourceAspect ? null : aspectLabel(input);
  const count =
    job.kind === "image" && (input?.n ?? assetCount) > 1
      ? `${input?.n ?? assetCount}张`
      : null;
  const clipDuration =
    job.kind === "video" && input?.duration
      ? `${input.duration}s`
      : null;
  const time = formatJobTime(jobDisplayIso(job));
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

/** 早 → 晚（对话流：早的在上；按创建时间，不因完成而重排） */
function sortJobsAsc(list: Job[]) {
  return [...list].sort((a, b) => {
    const d = jobCreatedMs(a) - jobCreatedMs(b);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function mergeJobsAsc(prev: Job[], incoming: Job[]) {
  const map = new Map<string, Job>();
  for (const j of prev) map.set(j.id, j);
  for (const j of incoming) map.set(j.id, j);
  return sortJobsAsc([...map.values()]);
}

function scrollElToBottom(el: HTMLElement | null, smooth = false) {
  if (!el) return;
  if (smooth) {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

function PromptInlineParts({
  parts,
}: {
  parts: PromptDisplayPart[];
}) {
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "text") {
          return <span key={`t-${i}`}>{part.text}</span>;
        }
        return (
          <span
            key={`m-${i}-${part.index1}`}
            className={cn(
              "joy-studio-mention-tag",
              part.kind === "video" && "is-video",
              part.kind === "audio" && "is-audio",
            )}
          >
            {part.url && part.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={part.url} alt="" className="joy-studio-mention-thumb" />
            ) : null}
            <span className="joy-studio-mention-label">{part.label}</span>
          </span>
        );
      })}
    </>
  );
}

/** 默认 2 行省略；展开为浮层，不挤占下方文档流 */
function StudioPrompt({
  text,
  referenceUrls = [],
  onCopy,
  onUse,
}: {
  text: string;
  referenceUrls?: string[];
  onCopy?: () => void;
  onUse?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const clampRef = useRef<HTMLParagraphElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const parts = useMemo(
    () => splitPromptForDisplay(text, referenceUrls),
    [text, referenceUrls],
  );

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
  }, [text, parts]);

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
        <PromptInlineParts parts={parts} />
      </p>
      {open ? (
        <div className="joy-studio-prompt-pop" role="dialog" aria-label="完整提示词">
          <p className="joy-studio-prompt-pop-text">
            <PromptInlineParts parts={parts} />
          </p>
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
  const count = shown.length;

  return (
    <div
      className={cn("joy-studio-refs", count > 1 && "is-stack")}
      data-count={count}
      aria-label="参考素材"
    >
      <div className="joy-studio-refs-fan">
        {shown.map((url, i) => {
          const kind = refMediaKind(url);
          const tilt =
            count === 1
              ? "is-tilt-solo"
              : i % 2 === 0
                ? "is-tilt-a"
                : "is-tilt-b";
          const thumb = (
            <div
              className={cn("joy-studio-ref-card", `is-${kind}`, tilt)}
              title={`参考${i + 1}`}
            >
              {kind === "video" ? (
                <JoyVideoPoster
                  url={url}
                  size="sm"
                  fallback="video"
                  className="size-full object-cover"
                />
              ) : kind === "audio" ? (
                <span className="joy-studio-ref-audio">音</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`参考${i + 1}`} />
              )}
              {i === 0 ? (
                <span className="joy-studio-ref-index">{i + 1}</span>
              ) : null}
            </div>
          );
          const hitStyle = {
            ["--ref-i"]: String(i),
          } as CSSProperties;
          return kind === "image" || kind === "other" ? (
            <PhotoView key={`${url}-${i}`} src={url}>
              <button
                type="button"
                className="joy-studio-ref-hit"
                style={hitStyle}
                aria-label={`预览参考${i + 1}`}
              >
                {thumb}
              </button>
            </PhotoView>
          ) : (
            <div
              key={`${url}-${i}`}
              className="joy-studio-ref-hit"
              style={hitStyle}
            >
              {thumb}
            </div>
          );
        })}
      </div>
      {extra > 0 ? (
        <span className="joy-studio-ref-more">+{extra}</span>
      ) : null}
    </div>
  );
}

/** Shared fit box — landscape/square vs taller portrait. */
const STUDIO_MEDIA_BOX = { maxW: 380, maxH: 270 };
const STUDIO_MEDIA_BOX_PORTRAIT = { maxW: 230, maxH: 380 };
/** Hover bottom tools shown inline; the rest go under 「…」. */
const STUDIO_THUMB_BAR_VISIBLE = 6;

function frameStyleForAspect(
  aspect: string,
  fluid = false,
): CSSProperties {
  const parts = aspect.split("/").map((s) => Number(s.trim()));
  const aw = parts[0];
  const ah = parts[1];
  const aspectRatio =
    aw > 0 && ah > 0 ? `${aw} / ${ah}` : aspect || "1 / 1";
  // Mosaic fill: stretch to grid cell.
  if (fluid) {
    return { aspectRatio, width: "100%" };
  }
  const portrait = aw > 0 && ah > 0 && ah > aw;
  const { maxW, maxH } = portrait
    ? STUDIO_MEDIA_BOX_PORTRAIT
    : STUDIO_MEDIA_BOX;
  if (!(aw > 0 && ah > 0)) {
    return { aspectRatio, width: Math.min(maxW, maxH) };
  }
  const scale = Math.min(maxW / aw, maxH / ah);
  return {
    aspectRatio,
    width: Math.round(aw * scale * 100) / 100,
  };
}

/** Whole-image frame for a split mosaic — same fit box as other cards. */
function mosaicShellStyle(aspect: string): CSSProperties {
  return frameStyleForAspect(aspect, false);
}

function StudioThumbHoverTools({
  mediaKind,
  variant = "full",
  onDownload,
  onDelete,
  onCopyPrompt,
  onUseAsRef,
  onOpenCanvas,
  onCanvasTool,
  onOutpaint,
  canCopy,
  busyAction,
}: {
  mediaKind: "image" | "video";
  /** Mosaic tiles: download + delete only. */
  variant?: "full" | "simple";
  onDownload: () => void;
  onDelete?: () => void;
  onCopyPrompt?: () => void;
  onUseAsRef?: () => void;
  onOpenCanvas?: () => void;
  onCanvasTool?: (tool: StudioLocalTool) => void;
  onOutpaint?: () => void;
  canCopy?: boolean;
  busyAction?: string | null;
}) {
  const busy = Boolean(busyAction);
  const simple = variant === "simple";
  const refLabel = mediaKind === "video" ? "用作参考视频" : "用作参考图";
  const bottomTools = simple
    ? ([] as Array<{
        key: string;
        label: string;
        icon: ReactNode;
        disabled: boolean;
        onClick: () => void;
      }>)
    : ([
    onUseAsRef
      ? {
          key: "ref",
          label: refLabel,
          icon: <ImagePlus strokeWidth={1.75} className="size-3.5" />,
          disabled: busy,
          onClick: onUseAsRef,
        }
      : null,
    onOpenCanvas
      ? {
          key: "canvas",
          label: busyAction === "canvas" ? "打开中…" : "去画布编辑",
          icon: <NavSvgIcon name="canvas" className="size-3.5" />,
          disabled: busyAction === "canvas",
          onClick: onOpenCanvas,
        }
      : null,
    mediaKind === "image" && onOutpaint
      ? {
          key: "outpaint",
          label: busyAction === "outpaint" ? "提交中…" : "扩图",
          icon: <CanvasIconOutpaint className="size-3.5" />,
          disabled: busyAction === "outpaint",
          onClick: onOutpaint,
        }
      : null,
    mediaKind === "image" && onCanvasTool
      ? {
          key: "split",
          label: "切图",
          icon: <CanvasIconGrid className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("split"),
        }
      : null,
    mediaKind === "image" && onCanvasTool
      ? {
          key: "to-panorama",
          label: "转720°全景",
          icon: <CanvasIconPanorama className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("to-panorama"),
        }
      : null,
    mediaKind === "image" && onCanvasTool
      ? {
          key: "inpaint",
          label: "局部重绘",
          icon: <CanvasIconBrush className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("inpaint"),
        }
      : null,
    mediaKind === "image" && onCanvasTool
      ? {
          key: "crop",
          label: "裁剪",
          icon: <CanvasIconScissors className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("crop"),
        }
      : null,
    mediaKind === "image" && onCanvasTool
      ? {
          key: "angle",
          label: "多角度",
          icon: <CanvasIconWand className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("angle"),
        }
      : null,
    mediaKind === "video" && onCanvasTool
      ? {
          key: "capture-frame",
          label: "截帧",
          icon: <CanvasIconFrame className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("capture-frame"),
        }
      : null,
    mediaKind === "video" && onCanvasTool
      ? {
          key: "extract-audio",
          label: "分离音频",
          icon: <CanvasIconAudio className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("extract-audio"),
        }
      : null,
    mediaKind === "video" && onCanvasTool
      ? {
          key: "trim-video",
          label: "剪辑",
          icon: <CanvasIconScissors className="size-3.5" />,
          disabled: busy,
          onClick: () => onCanvasTool("trim-video"),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    icon: ReactNode;
    disabled: boolean;
    onClick: () => void;
  }>);

  const [moreOpen, setMoreOpen] = useState(false);
  const visibleTools = bottomTools.slice(0, STUDIO_THUMB_BAR_VISIBLE);
  const overflowTools = bottomTools.slice(STUDIO_THUMB_BAR_VISIBLE);

  return (
    <div
      className={cn(
        "joy-studio-thumb-hover",
        moreOpen && "is-menu-open",
      )}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="joy-studio-thumb-bar joy-studio-thumb-bar--top">
        <button
          type="button"
          className="joy-studio-thumb-icon"
          aria-label="下载"
          title="下载"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
        >
          <Download strokeWidth={1.75} className="size-3.5" />
        </button>
        {onDelete ? (
          <button
            type="button"
            className="joy-studio-thumb-icon"
            aria-label="删除"
            title="删除"
            disabled={busy || busyAction === "delete"}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 strokeWidth={1.75} className="size-3.5" />
          </button>
        ) : null}
        {!simple && canCopy ? (
          <button
            type="button"
            className="joy-studio-thumb-icon"
            aria-label="复制提示词"
            title="复制提示词"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onCopyPrompt?.();
            }}
          >
            <Copy strokeWidth={1.75} className="size-3.5" />
          </button>
        ) : null}
      </div>

      {bottomTools.length > 0 ? (
        <div className="joy-studio-thumb-bar joy-studio-thumb-bar--bottom">
          {visibleTools.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="joy-studio-thumb-icon"
              aria-label={tool.label}
              title={tool.label}
              disabled={tool.disabled}
              onClick={(e) => {
                e.stopPropagation();
                tool.onClick();
              }}
            >
              {tool.icon}
            </button>
          ))}
          {overflowTools.length > 0 ? (
            <DropdownMenu open={moreOpen} onOpenChange={setMoreOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="joy-studio-thumb-icon"
                  aria-label="更多"
                  title="更多"
                  disabled={busy}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal strokeWidth={1.75} className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="top"
                className="w-40"
                onClick={(e) => e.stopPropagation()}
              >
                {overflowTools.map((tool) => (
                  <DropdownMenuItem
                    key={tool.key}
                    disabled={tool.disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      tool.onClick();
                    }}
                  >
                    {tool.icon}
                    {tool.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StudioImageThumb({
  src,
  aspectRatio,
  fluid = false,
  mosaic = false,
  onDownload,
  onCopyPrompt,
  onUseAsRef,
  onOpenCanvas,
  onCanvasTool,
  onOutpaint,
  canCopy,
  busyAction,
}: {
  src: string;
  aspectRatio: string;
  fluid?: boolean;
  /** Tile inside a split mosaic — download only, fills grid cell. */
  mosaic?: boolean;
  onDownload: () => void;
  onCopyPrompt?: () => void;
  onUseAsRef?: () => void;
  onOpenCanvas?: () => void;
  onCanvasTool?: (tool: StudioLocalTool) => void;
  onOutpaint?: () => void;
  canCopy?: boolean;
  busyAction?: string | null;
}) {
  const { url: fullUrl, loading: fullLoading } = useDisplayMediaUrl(src);
  const previewSrc = fullUrl || src;
  const frameStyle = useMemo(
    () =>
      mosaic
        ? ({ width: "100%", height: "100%" } as CSSProperties)
        : frameStyleForAspect(aspectRatio, fluid),
    [aspectRatio, fluid, mosaic],
  );

  const image = fullLoading && needsProxyPlaceholder(src) ? (
    <span
      aria-busy
      className="block size-full animate-pulse bg-muted/40"
    />
  ) : mosaic ? (
    <PhotoView src={previewSrc}>
      <button
        type="button"
        className="joy-studio-thumb-preview"
        aria-label="预览切片"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewSrc}
          alt=""
          className="joy-studio-mosaic-tile-img"
          draggable={false}
        />
      </button>
    </PhotoView>
  ) : (
    <PhotoView src={previewSrc}>
      <button
        type="button"
        className="joy-studio-thumb-preview"
        aria-label="预览图片"
      >
        <JoyAssetThumb
          url={previewSrc}
          size="md"
          className="size-full object-cover"
        />
      </button>
    </PhotoView>
  );

  return (
    <div
      className={cn("joy-studio-thumb-frame", mosaic && "is-mosaic-tile")}
      style={frameStyle}
    >
      {image}
      <StudioThumbHoverTools
        mediaKind="image"
        variant={mosaic ? "simple" : "full"}
        onDownload={onDownload}
        onCopyPrompt={mosaic ? undefined : onCopyPrompt}
        onUseAsRef={mosaic ? undefined : onUseAsRef}
        onOpenCanvas={mosaic ? undefined : onOpenCanvas}
        onCanvasTool={mosaic ? undefined : onCanvasTool}
        onOutpaint={mosaic ? undefined : onOutpaint}
        canCopy={mosaic ? false : canCopy}
        busyAction={busyAction}
      />
    </div>
  );
}

function needsProxyPlaceholder(src: string) {
  // Only show pulse while proxying flaky CDNs; TOS thumbs load directly.
  try {
    return /toapis\.cn/i.test(new URL(src).hostname);
  } catch {
    return false;
  }
}

/** Video frame that can adopt intrinsic aspect for adaptive/auto jobs. */
function StudioVideoThumb({
  src,
  fallbackAspect,
  flexible,
  fluid = false,
  onDownload,
  onCopyPrompt,
  onUseAsRef,
  onOpenCanvas,
  onCanvasTool,
  canCopy,
  busyAction,
}: {
  src: string;
  fallbackAspect: string;
  flexible: boolean;
  fluid?: boolean;
  onDownload: () => void;
  onCopyPrompt?: () => void;
  onUseAsRef?: () => void;
  onOpenCanvas?: () => void;
  onCanvasTool?: (tool: StudioLocalTool) => void;
  canCopy?: boolean;
  busyAction?: string | null;
}) {
  const [aspect, setAspect] = useState(fallbackAspect);
  // ToAPIs CDN often fails in Chrome for multi‑MB mp4 — same proxy path as images.
  const { url: playUrl, loading: playLoading } = useDisplayMediaUrl(src, "video");
  const poster = tosVideoPosterUrl(src) || undefined;

  useEffect(() => {
    setAspect(fallbackAspect);
  }, [fallbackAspect, src]);

  const frameStyle = useMemo(
    () => frameStyleForAspect(aspect, fluid),
    [aspect, fluid],
  );

  return (
    <div
      className="joy-studio-thumb joy-studio-thumb-video"
      style={frameStyle}
    >
      {playLoading || !playUrl ? (
        <span
          aria-busy
          className="block size-full animate-pulse bg-muted/40"
        />
      ) : (
        <StudioPlyrPlayer
          src={playUrl}
          poster={poster}
          onNaturalAspect={
            flexible
              ? (next) => {
                  setAspect((prev) => (prev === next ? prev : next));
                }
              : undefined
          }
        />
      )}
      <StudioThumbHoverTools
        mediaKind="video"
        onDownload={onDownload}
        onCopyPrompt={onCopyPrompt}
        onUseAsRef={onUseAsRef}
        onOpenCanvas={onOpenCanvas}
        onCanvasTool={onCanvasTool}
        canCopy={canCopy}
        busyAction={busyAction}
      />
    </div>
  );
}

function JobActions({
  job,
  regeneratingId,
  deletingId,
  onRegenerate,
  onReedit,
  onCopyPrompt,
  onDelete,
}: {
  job: Job;
  regeneratingId: string | null;
  deletingId: string | null;
  onRegenerate: () => void;
  onReedit: () => void;
  onCopyPrompt: () => void;
  onDelete: () => void;
}) {
  /** Only generation outputs — never reference uploads. */
  const outputs = useMemo(() => {
    const assets = jobOutputAssets(job);
    const refIds = new Set(
      (job.input?.referenceAssetIds ?? []).filter(Boolean).map(String),
    );
    const refUrls = new Set(
      (job.input?.referenceUrls ?? [])
        .map((u) => String(u || "").trim())
        .filter(Boolean),
    );
    return assets.filter(
      (a) => !refIds.has(a.id) && !refUrls.has(String(a.url || "").trim()),
    );
  }, [job]);
  const canDownload = outputs.length > 0;
  const splitJob = isSplitJob(job);
  const canReedit = !splitJob && Boolean(job.input?.prompt?.trim());

  async function onDownload() {
    if (!canDownload) {
      toast.error("暂无可下载的生成结果");
      return;
    }
    try {
      for (const asset of outputs) {
        await downloadAsset(
          asset.url,
          isVideoAsset(asset) ? "video" : asset.kind,
        );
      }
      toast.success(
        outputs.length > 1
          ? splitJob
            ? "已开始下载全部切片"
            : "已开始下载全部生成结果"
          : "已开始下载",
      );
    } catch {
      toast.error("下载失败");
    }
  }

  if (splitJob) {
    return (
      <div className="joy-studio-actions">
        <button
          type="button"
          className="joy-studio-action"
          disabled={!canDownload}
          onClick={() => void onDownload()}
        >
          <Download strokeWidth={1.75} className="h-3.5 w-3.5" />
          {outputs.length > 1 ? "下载全部" : "下载"}
        </button>
        <button
          type="button"
          className="joy-studio-action"
          disabled={deletingId === job.id}
          onClick={onDelete}
        >
          <Trash2 strokeWidth={1.75} className="h-3.5 w-3.5" />
          删除
        </button>
      </div>
    );
  }

  return (
    <div className="joy-studio-actions">
      <button
        type="button"
        className="joy-studio-action"
        disabled={!canReedit}
        onClick={onReedit}
      >
        <PencilLine strokeWidth={1.75} className="h-3.5 w-3.5" />
        重新编辑
      </button>
      <button
        type="button"
        className="joy-studio-action"
        disabled={regeneratingId === job.id || !canReedit}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="joy-studio-action"
            aria-label="更多操作"
          >
            <MoreHorizontal strokeWidth={1.75} className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem
            disabled={!canDownload}
            onClick={() => void onDownload()}
          >
            <Download className="h-4 w-4" />
            下载
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canReedit} onClick={onCopyPrompt}>
            <Copy className="h-4 w-4" />
            复制提示词
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={deletingId === job.id}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StudioInner() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [feedVisible, setFeedVisible] = useState(false);
  const [nearBottom, setNearBottom] = useState(true);
  const [remixKey, setRemixKey] = useState(0);
  const [remixPrompt, setRemixPrompt] = useState<string | undefined>();
  const [remixRefs, setRemixRefs] = useState<string[]>([]);
  const [remixRefAssetIds, setRemixRefAssetIds] = useState<string[]>([]);
  const [remixKind, setRemixKind] = useState<"image" | "video" | undefined>();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assetActionBusy, setAssetActionBusy] = useState<string | null>(null);
  const [imageTool, setImageTool] = useState<{
    mode: ImageToolMode;
    asset: StudioMediaAsset;
  } | null>(null);
  const [maskEdit, setMaskEdit] = useState<{
    asset: StudioMediaAsset;
    modelId?: string;
  } | null>(null);
  const [angleEdit, setAngleEdit] = useState<{
    asset: StudioMediaAsset;
    modelId?: string;
  } | null>(null);
  const [videoTrim, setVideoTrim] = useState<{
    asset: StudioMediaAsset;
  } | null>(null);
  const [videoTrimBusy, setVideoTrimBusy] = useState(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const jobsRef = useRef<Job[]>([]);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const nearBottomRef = useRef(true);
  const jumpingToBottomRef = useRef(false);
  const didInitRef = useRef(false);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const scrollFeedToBottom = useCallback((smooth?: boolean) => {
    stickToBottomRef.current = true;
    nearBottomRef.current = true;
    setNearBottom(true);
    // Only explicit `true` — rAF may pass a timestamp if used as callback.
    scrollElToBottom(scrollRef.current, smooth === true);
  }, []);

  /** Scroll first while staying compact; expand only after settled — avoids dock bump/flash. */
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      scrollFeedToBottom(false);
      return;
    }

    stickToBottomRef.current = true;
    jumpingToBottomRef.current = true;

    const finish = () => {
      jumpingToBottomRef.current = false;
      nearBottomRef.current = true;
      setNearBottom(true);
      // Expand changes dock height — snap once layout settles.
      requestAnimationFrame(() => {
        scrollElToBottom(el, false);
        requestAnimationFrame(() => scrollElToBottom(el, false));
      });
    };

    const distance =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 80) {
      finish();
      return;
    }

    scrollElToBottom(el, true);

    let frames = 0;
    let stillFrames = 0;
    let lastTop = el.scrollTop;
    const tick = () => {
      if (!jumpingToBottomRef.current) return;
      frames += 1;
      const top = el.scrollTop;
      const dist = el.scrollHeight - top - el.clientHeight;
      const moved = Math.abs(top - lastTop) > 0.5;
      lastTop = top;
      if (dist < 80 && !moved) {
        stillFrames += 1;
        if (stillFrames >= 2) {
          finish();
          return;
        }
      } else {
        stillFrames = 0;
      }
      if (frames > 75) {
        scrollElToBottom(el, false);
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [scrollFeedToBottom]);

  const loadInitial = useCallback(async () => {
    try {
      const res = await api<JobsPage>(`/jobs?take=${JOBS_PAGE}&scope=studio`);
      const next = sortJobsAsc(res.items.filter(isStudioFeedJob));
      setJobs(next);
      setHasMore(res.hasMore);
      stickToBottomRef.current = true;
      for (const job of next) {
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

  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingMoreRef.current) return;
    const current = jobsRef.current;
    if (current.length === 0) return;

    const oldest = current[0];
    loadingMoreRef.current = true;
    setLoadingMore(true);

    const viewport = scrollRef.current;
    const prevHeight = viewport?.scrollHeight ?? 0;
    const prevTop = viewport?.scrollTop ?? 0;

    try {
      const qs = new URLSearchParams({
        take: String(JOBS_PAGE),
        before: jobCreatedIso(oldest),
        beforeId: oldest.id,
        scope: "studio",
      });
      const res = await api<JobsPage>(`/jobs?${qs}`);
      const items = res.items.filter(isStudioFeedJob);
      if (items.length === 0) {
        setHasMore(res.hasMore);
        return;
      }
      setJobs((prev) => mergeJobsAsc(prev, items));
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
    const res = await api<JobsPage>(`/jobs?take=${JOBS_PAGE}&scope=studio`);
    setJobs((prev) =>
      mergeJobsAsc(prev, res.items.filter(isStudioFeedJob)).filter(
        isStudioFeedJob,
      ),
    );
    if (stickToBottomRef.current) {
      requestAnimationFrame(() => scrollElToBottom(scrollRef.current));
    }
  }, []);

  // First mount only.
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void loadInitial();
  }, [loadInitial]);

  // Pin to bottom before first paint of the feed (avoids top→bottom flash).
  useLayoutEffect(() => {
    if (!bootstrapped || feedVisible) return;
    if (jobs.length > 0) scrollFeedToBottom();
    setFeedVisible(true);
  }, [bootstrapped, feedVisible, jobs.length, scrollFeedToBottom]);

  useJobLifecycle({
    getBusyJobIds: () =>
      jobsRef.current.filter((j) => isBusy(j.status)).map((j) => j.id),
    onProgress: (payload) => {
      if (!payload.jobId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === payload.jobId);
        if (idx < 0) {
          void refreshLatest();
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
      const failures = Array.isArray(payload.failures)
        ? payload.failures
            .filter((f) => Number.isFinite(f?.index))
            .map((f) => ({
              index: Math.floor(f.index),
              error: String(f.error || "").trim() || "生成失败",
            }))
        : undefined;
      const requested =
        typeof payload.requested === "number" && payload.requested > 0
          ? Math.min(Math.floor(payload.requested), 4)
          : undefined;
      let found = false;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        found = true;
        const copy = [...prev];
        const prevJob = copy[idx];
        copy[idx] = {
          ...prevJob,
          status: "succeeded",
          progress: 100,
          assets: assets.length ? assets : prevJob.assets,
          error: null,
          result: {
            ...prevJob.result,
            ...(assets.length
              ? {
                  assetIds: assets.map((a) => a.id),
                  urls: assets.map((a) => a.url),
                }
              : null),
            ...(requested != null ? { requested } : null),
            ...(failures ? { failures } : { failures: undefined }),
          },
        };
        return copy;
      });
      if (!found || !assets.length) void refreshLatest();
      else if (stickToBottomRef.current) {
        requestAnimationFrame(() => scrollElToBottom(scrollRef.current));
      }
    },
    onFailed: (payload) => {
      const jobId = payload.jobId;
      if (!jobId) return;
      let found = false;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === jobId);
        if (idx < 0) return prev;
        found = true;
        const copy = [...prev];
        const prevJob = copy[idx];
        const message = payload.error ?? prevJob.error ?? "生成失败";
        const requested = Math.min(
          Math.max(
            Number(payload.requested) ||
              Number(prevJob.result?.requested) ||
              Number(prevJob.input?.n) ||
              1,
            1,
          ),
          4,
        );
        copy[idx] = {
          ...prevJob,
          status: payload.status === "cancelled" ? "cancelled" : "failed",
          error: message,
          result: {
            ...prevJob.result,
            requested,
            failures: Array.from({ length: requested }, (_, index) => ({
              index,
              error: message,
            })),
          },
        };
        return copy;
      });
      if (!found) void refreshLatest();
    },
    onAssetUpdated: (payload) => {
      const next = payload.asset;
      if (!next?.id || !next.url) return;
      const id = String(next.id);
      const url = String(next.url);
      setJobs((prev) =>
        prev.map((job) => {
          if (!job.assets?.some((a) => a.id === id)) return job;
          return {
            ...job,
            assets: job.assets.map((a) =>
              a.id === id ? { ...a, url } : a,
            ),
          };
        }),
      );
    },
  });

  const hasJobs = jobs.length > 0;
  const hasBusyJobs = jobs.some((j) => isBusy(j.status));
  const dockCompact = hasJobs && !nearBottom;

  // 进行中任务：每秒从 0s 起跳累计用时
  useEffect(() => {
    if (!hasBusyJobs) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasBusyJobs]);

  // 向上滚到顶部 → 加载更早
  useEffect(() => {
    if (!hasJobs || !feedVisible) return;
    const sentinel = topSentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root) return;

    const onScroll = () => {
      const distanceFromBottom =
        root.scrollHeight - root.scrollTop - root.clientHeight;
      // During jump-to-bottom, keep compact until scroll settles (finish() expands).
      if (jumpingToBottomRef.current) {
        stickToBottomRef.current = true;
        return;
      }
      // Hysteresis: leave bottom only when clearly away; return only when close.
      // A single threshold + padding changes caused compact ↔ expand flicker.
      const nextNearBottom = nearBottomRef.current
        ? distanceFromBottom < 200
        : distanceFromBottom < 72;
      stickToBottomRef.current = nextNearBottom;
      if (nextNearBottom === nearBottomRef.current) return;
      nearBottomRef.current = nextNearBottom;
      setNearBottom(nextNearBottom);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        // Theme / layout thrash can briefly expose the sentinel while the user
        // is still near the bottom — only load older when actually scrolled up.
        if (root.scrollTop > 96) return;
        void loadOlder();
      },
      { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => {
      root.removeEventListener("scroll", onScroll);
      io.disconnect();
    };
  }, [loadOlder, hasJobs, feedVisible]);

  function applyPrompt(job: Job) {
    const prompt = job.input?.prompt?.trim();
    if (!prompt) {
      toast.error("没有可用的提示词");
      return;
    }
    setRemixPrompt(prompt);
    setRemixRefs(jobReferenceUrls(job.input));
    setRemixRefAssetIds(
      (job.input?.referenceAssetIds ?? []).filter(Boolean).map(String),
    );
    setRemixKind(job.kind === "video" ? "video" : "image");
    setRemixKey((k) => k + 1);
    toast.message("已填入提示词与参考素材，可继续修改后生成");
    requestAnimationFrame(() => {
      document
        .querySelector(".joy-studio-dock")
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  function applyAssetAsReference(asset: StudioMediaAsset, asVideo = false) {
    setRemixPrompt("");
    setRemixRefs([asset.url]);
    setRemixRefAssetIds(asset.id ? [asset.id] : []);
    setRemixKind(asVideo ? "video" : "image");
    setRemixKey((k) => k + 1);
    toast.message(asVideo ? "已用作参考视频" : "已用作参考图");
    requestAnimationFrame(() => {
      document
        .querySelector(".joy-studio-dock")
        ?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  async function openAssetCanvas(asset: StudioMediaAsset) {
    const key = `${asset.id}:canvas`;
    setAssetActionBusy(key);
    try {
      const opened = await openAssetInNewCanvas(asset);
      toast.success("已打开画布编辑");
      router.push(opened.href);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "打开画布失败");
    } finally {
      setAssetActionBusy(null);
    }
  }

  async function afterStudioJob(
    jobId: string,
    meta: { kind: "image" | "video"; prompt: string; modelName?: string | null },
  ) {
    watchStudioGeneration(jobId, {
      kind: meta.kind,
      modelName: meta.modelName,
      prompt: meta.prompt,
    });
    void ensureGenerationNotifyPermission();
    stickToBottomRef.current = true;
    nearBottomRef.current = true;
    setNearBottom(true);
    await refreshLatest();
    requestAnimationFrame(() => scrollFeedToBottom());
  }

  async function runLocalTool(
    asset: StudioMediaAsset,
    tool: StudioLocalTool,
    job?: Job,
  ) {
    const modelId = job?.input?.modelId;
    const basePrompt = job?.input?.prompt?.trim();

    if (tool === "crop" || tool === "split") {
      setImageTool({ mode: tool, asset });
      return;
    }
    if (tool === "inpaint") {
      setMaskEdit({ asset, modelId });
      return;
    }
    if (tool === "angle") {
      setAngleEdit({ asset, modelId });
      return;
    }
    if (tool === "trim-video") {
      setVideoTrim({ asset });
      return;
    }

    const key = `${asset.id}:${tool}`;
    setAssetActionBusy(key);
    try {
      if (tool === "to-panorama") {
        const created = await submitPanoramaJob(asset, {
          prompt: basePrompt,
          modelId,
        });
        await afterStudioJob(created.id, {
          kind: "image",
          prompt: "转720°全景",
          modelName: job?.modelName,
        });
        toast.success("已提交转720°全景任务");
        return;
      }
      if (tool === "capture-frame") {
        const created = await captureStudioFrame(asset);
        await afterStudioJob(created.id, {
          kind: "image",
          prompt: "视频截帧",
        });
        toast.success("已截取首帧");
        return;
      }
      if (tool === "extract-audio") {
        const result = await extractStudioAudio(asset);
        await afterStudioJob(result.videoJobId, {
          kind: "video",
          prompt: "分离音频 · 无声视频",
        });
        toast.success("已分离音频（无声视频已加入创作流，音频在资产库）");
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setAssetActionBusy(null);
    }
  }

  async function commitImageToolPieces(pieces: RasterPiece[]) {
    const session = imageTool;
    if (!session) return;
    const labels: Record<ImageToolMode, string> = {
      crop: "裁剪",
      split: "切图",
      view: "查看大图",
    };
    const label = labels[session.mode] ?? "本地编辑";
    setAssetActionBusy(`${session.asset.id}:${session.mode}`);
    try {
      const created = await commitStudioImagePieces(pieces, label, {
        localTool: session.mode === "view" ? undefined : session.mode,
      });
      setImageTool(null);
      await afterStudioJob(created.id, { kind: "image", prompt: label });
      toast.success(
        pieces.length > 1 ? `已生成 ${pieces.length} 张结果` : "已生成结果",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label}失败`);
    } finally {
      setAssetActionBusy(null);
    }
  }

  async function commitMaskEdit(payload: { prompt: string; blob: Blob }) {
    const session = maskEdit;
    if (!session) return;
    setAssetActionBusy(`${session.asset.id}:inpaint`);
    try {
      const created = await submitInpaintJob(session.asset, payload.blob, {
        prompt: payload.prompt,
        modelId: session.modelId,
      });
      setMaskEdit(null);
      await afterStudioJob(created.id, {
        kind: "image",
        prompt: "局部重绘",
      });
      toast.success("已提交局部重绘");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "局部重绘失败");
    } finally {
      setAssetActionBusy(null);
    }
  }

  async function commitAngleEdit(payload: {
    params: ImageAngleParams;
    modelId: string;
  }) {
    const session = angleEdit;
    if (!session) return;
    setAssetActionBusy(`${session.asset.id}:angle`);
    try {
      const created = await submitAngleJob(session.asset, payload.params, {
        modelId: payload.modelId || session.modelId,
      });
      setAngleEdit(null);
      await afterStudioJob(created.id, {
        kind: "image",
        prompt: "多角度",
      });
      toast.success("已提交多角度生成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "多角度失败");
    } finally {
      setAssetActionBusy(null);
    }
  }

  async function commitVideoTrim(range: { start: number; end: number }) {
    const session = videoTrim;
    if (!session || videoTrimBusy) return;
    setVideoTrimBusy(true);
    setAssetActionBusy(`${session.asset.id}:trim-video`);
    try {
      const created = await trimStudioVideo(session.asset, range);
      setVideoTrim(null);
      await afterStudioJob(created.id, {
        kind: "video",
        prompt: "视频剪辑",
      });
      toast.success("已完成剪辑");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "剪辑失败");
    } finally {
      setVideoTrimBusy(false);
      setAssetActionBusy(null);
    }
  }

  async function outpaintAsset(asset: StudioMediaAsset, job: Job) {
    const key = `${asset.id}:outpaint`;
    setAssetActionBusy(key);
    try {
      const created = await submitOutpaintJob(asset, {
        prompt: job.input?.prompt?.trim(),
        modelId: job.input?.modelId,
      });
      await afterStudioJob(created.id, {
        kind: "image",
        prompt: "扩图",
        modelName: job.modelName,
      });
      toast.success("已提交扩图任务");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "扩图失败");
    } finally {
      setAssetActionBusy(null);
    }
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
      const created = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: job.kind,
          input: job.input,
        },
      });
      watchStudioGeneration(created.id, {
        kind: job.kind,
        modelName: job.modelName,
        prompt: job.input?.prompt,
      });
      void ensureGenerationNotifyPermission();
      toast.success("已再次提交生成");
      stickToBottomRef.current = true;
      await refreshLatest();
      requestAnimationFrame(() => scrollFeedToBottom());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "再次生成失败");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function removeJob(job: Job) {
    const ok = await confirmDialog({
      title: "确认删除",
      description:
        "将永久删除这条创作记录、关联资产，以及云存储中的文件，且无法找回",
      confirmText: "删除",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(job.id);
    try {
      await api(`/jobs/${job.id}`, { method: "DELETE" });
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast.success("已删除记录与资产");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  const feed = useMemo(() => jobs, [jobs]);

  return (
    <div
      ref={scrollRef}
      className={cn("joy-studio", !feedVisible && "is-pending")}
    >
      <div className="joy-studio-top">
        <Link href="/assets" className="joy-studio-assets-btn">
          <FolderOpen className="h-4 w-4" strokeWidth={1.75} />
          创作资产
        </Link>
      </div>

      {!bootstrapped ? (
        <div className="joy-studio-boot" aria-hidden />
      ) : !hasJobs ? (
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
          <div>
            {feed.map((job) => {
              const assets = jobOutputAssets(job);
              const slots = jobDisplaySlots(job, assets);
              const busy = isBusy(job.status);
              const metaParts = jobMetaParts(job, assets.length, now);
              const skeletonCount = Math.min(
                Math.max(job.input?.n ?? (job.kind === "image" ? 2 : 1), 1),
                4,
              );
              const ar = aspectCss(job.input);
              const refUrls = jobReferenceUrls(job.input);
              const gridCount =
                slots.length > 0
                  ? slots.length
                  : assets.length > 0
                    ? assets.length
                    : skeletonCount;
              const failedOnly =
                slots.length > 0 && slots.every((s) => s.kind === "failed");
              const partialFail =
                !failedOnly &&
                slots.some((s) => s.kind === "failed") &&
                slots.some((s) => s.kind === "asset");
              const failSummary = partialFail
                ? slots.find((s) => s.kind === "failed")?.error || null
                : null;

              const isVideoJob =
                job.kind === "video" || assets.some((a) => isVideoAsset(a));
              const mosaic = jobMosaicLayout(job, Math.max(assets.length, slots.length));
              const mosaicCols = mosaic?.cols ?? 0;
              const mosaicRows = mosaic?.rows ?? 0;
              // Mosaic = compact reconstructed whole; regular cards stay fit-box.
              const fluidGrid = false;
              const gridColsClass = mosaic
                ? null
                : gridCount >= 4
                  ? "is-cols-4"
                  : gridCount === 3
                    ? "is-cols-3"
                    : gridCount === 2
                      ? "is-cols-2"
                      : null;
              const tileStyle = mosaic
                ? ({ width: "100%", height: "100%" } as CSSProperties)
                : frameStyleForAspect(ar, fluidGrid);
              const mosaicShellFrame = mosaic ? mosaicShellStyle(ar) : undefined;
              const mosaicStyle = mosaic
                ? ({
                    gridTemplateColumns: `repeat(${mosaicCols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${mosaicRows}, minmax(0, 1fr))`,
                  } as CSSProperties)
                : undefined;

              return (
                <JoyPhotoProvider key={job.id}>
                <article
                  className={cn(
                    "joy-studio-job",
                    isVideoJob && "is-video",
                    mosaic && "is-mosaic",
                  )}
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
                          referenceUrls={refUrls}
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
                        {partialFail ? (
                          <p className="joy-studio-error">
                            部分图片生成失败
                            {failSummary ? `：${failSummary}` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {slots.length > 0 ? (
                    <div
                      className={cn(mosaic && "joy-studio-mosaic-shell")}
                      style={mosaicShellFrame}
                    >
                      <div
                        className={cn(
                          "joy-studio-grid",
                          !mosaic && gridCount === 1 && "is-single",
                          !mosaic && gridCount >= 2 && "is-multi",
                          mosaic && "is-mosaic",
                          !mosaic && gridColsClass,
                          isVideoJob && "is-video",
                        )}
                        style={mosaicStyle}
                      >
                        {slots.map((slot) => {
                        if (slot.kind === "failed") {
                          return (
                            <FailedThumb
                              key={`${job.id}-fail-${slot.index}`}
                              aspectRatio={ar}
                              error={slot.error}
                              style={tileStyle}
                            />
                          );
                        }
                        const asset = slot.asset;
                        const media: StudioMediaAsset = {
                          id: asset.id,
                          url: asset.url,
                          kind: isVideoAsset(asset) ? "video" : asset.kind,
                        };
                        const busyKey = assetActionBusy?.startsWith(`${asset.id}:`)
                          ? assetActionBusy.slice(asset.id.length + 1)
                          : null;
                        return isVideoAsset(asset) ? (
                          <StudioVideoThumb
                            key={asset.id}
                            src={asset.url}
                            fallbackAspect={ar}
                            fluid={fluidGrid}
                            // Always adopt decoded video size — i2v follows first frame,
                            // so UI-selected ratio may not match actual output.
                            flexible
                            canCopy={Boolean(job.input?.prompt?.trim())}
                            busyAction={busyKey}
                            onCopyPrompt={() => void copyPrompt(job)}
                            onUseAsRef={() => applyAssetAsReference(media, true)}
                            onOpenCanvas={() => void openAssetCanvas(media)}
                            onCanvasTool={(tool) =>
                              void runLocalTool(media, tool, job)
                            }
                            onDownload={() => {
                              void downloadAsset(asset.url, "video")
                                .then(() => toast.success("已开始下载"))
                                .catch(() => toast.error("下载失败"));
                            }}
                          />
                        ) : (
                          <StudioImageThumb
                            key={asset.id}
                            src={asset.url}
                            aspectRatio={ar}
                            fluid={fluidGrid}
                            mosaic={Boolean(mosaic)}
                            canCopy={Boolean(job.input?.prompt?.trim())}
                            busyAction={busyKey}
                            onCopyPrompt={() => void copyPrompt(job)}
                            onUseAsRef={() => applyAssetAsReference(media)}
                            onOpenCanvas={() => void openAssetCanvas(media)}
                            onCanvasTool={(tool) =>
                              void runLocalTool(media, tool, job)
                            }
                            onOutpaint={() => void outpaintAsset(media, job)}
                            onDownload={() => {
                              void downloadAsset(asset.url, asset.kind)
                                .then(() => toast.success("已开始下载该切片"))
                                .catch(() => toast.error("下载失败"));
                            }}
                          />
                        );
                      })}
                      </div>
                    </div>
                  ) : busy ? (
                    <div className="joy-studio-generating">
                      <div
                        className={cn(
                          "joy-studio-grid",
                          gridCount === 1 && "is-single",
                          gridCount >= 2 && "is-multi",
                          gridColsClass,
                          isVideoJob && "is-video",
                        )}
                      >
                        {Array.from({ length: skeletonCount }).map((_, i) => (
                          <GeneratingThumb
                            key={`${job.id}-sk-${i}`}
                            aspectRatio={ar}
                            /* Animated webp/gif — safe to show on every tile */
                            useVideo
                            style={{
                              ...frameStyleForAspect(ar, false),
                              ["--joy-gen-fall-delay" as string]: `${i * 0.35}s`,
                            }}
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
                    onReedit={() => applyPrompt(job)}
                    onCopyPrompt={() => void copyPrompt(job)}
                    onDelete={() => void removeJob(job)}
                  />
                </article>
                </JoyPhotoProvider>
              );
            })}
          </div>
        </div>
      )}

      <div className="joy-studio-dock">
        <div
          className={cn(
            "joy-studio-dock-inner",
            dockCompact && "is-compact",
          )}
        >
          <div className="joy-studio-dock-rail">
            {dockCompact ? (
              <div className="joy-studio-jump-row">
                <button
                  type="button"
                  className="joy-studio-jump-bottom"
                  onClick={jumpToBottom}
                >
                  回到底部
                  <ChevronsDown
                    className="size-3.5 opacity-70"
                    strokeWidth={2}
                  />
                </button>
              </div>
            ) : null}
            <CreationComposer
              key={`dock-${remixKey}`}
              variant="dock"
              compact={dockCompact}
              promptSeed={remixPrompt}
              refSeed={remixRefs}
              refAssetIdSeed={remixRefAssetIds}
              kindSeed={remixKind}
              onSubmitted={() => {
                stickToBottomRef.current = true;
                nearBottomRef.current = true;
                setNearBottom(true);
                void refreshLatest().then(() => {
                  requestAnimationFrame(() => scrollFeedToBottom());
                });
              }}
            />
          </div>
        </div>
      </div>

      <ImageToolDialog
        mode={imageTool?.mode ?? null}
        url={imageTool?.asset.url ?? ""}
        onClose={() => setImageTool(null)}
        onCommit={commitImageToolPieces}
      />
      <MaskEditDialog
        open={Boolean(maskEdit)}
        url={maskEdit?.asset.url ?? ""}
        onClose={() => setMaskEdit(null)}
        onConfirm={commitMaskEdit}
      />
      <ImageAngleDialog
        open={Boolean(angleEdit)}
        url={angleEdit?.asset.url ?? ""}
        onClose={() => setAngleEdit(null)}
        onConfirm={(payload) => void commitAngleEdit(payload)}
      />
      <AudioTrimDialog
        open={Boolean(videoTrim)}
        url={videoTrim?.asset.url ?? ""}
        mode="video"
        busy={videoTrimBusy}
        onClose={() => {
          if (!videoTrimBusy) setVideoTrim(null);
        }}
        onConfirm={(range) => void commitVideoTrim(range)}
      />
    </div>
  );
}

export function StudioForm() {
  return (
    <div className="h-full min-h-0">
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-muted-foreground">
            加载中…
          </div>
        }
      >
        <StudioInner />
      </Suspense>
    </div>
  );
}
