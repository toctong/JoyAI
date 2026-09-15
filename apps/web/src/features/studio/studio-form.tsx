"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import {
  Download,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { confirmDialog } from "@/shared/lib/confirm";
import { toast } from "@/shared/lib/toast";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { getJobsSocket } from "@/shared/lib/socket";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
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
  modelId?: string;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
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
  return d.format("YYYY年M月D日 HH:mm");
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function aspectLabel(input?: JobInput) {
  if (input?.ratio) return input.ratio;
  const w = input?.width;
  const h = input?.height;
  if (!w || !h) return null;
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function qualityLabel(input?: JobInput) {
  const max = Math.max(input?.width ?? 0, input?.height ?? 0);
  if (max >= 1400) return "2K";
  if (max >= 900) return "1K";
  return null;
}

/** Jimeng-style compact size line: `1:1 | 2K` */
function jobSizeMeta(job: Job) {
  const ratio = aspectLabel(job.input);
  const quality = qualityLabel(job.input);
  if (ratio && quality) return `${ratio} | ${quality}`;
  return ratio || quality || null;
}

function jobSubMeta(job: Job, assetCount = 0) {
  const duration =
    job.durationMs != null ? formatDurationMs(job.durationMs) : null;
  const time = formatJobTime(jobTimeIso(job));
  const parts = [
    time,
    job.channelName,
    job.modelName,
    job.kind === "image" && assetCount > 1 ? `${assetCount} 张` : null,
    job.kind === "video" ? "视频" : null,
    duration && duration !== "—" ? `用时 ${duration}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
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
  if (input?.ratio?.includes(":")) {
    const [a, b] = input.ratio.split(":").map(Number);
    if (a > 0 && b > 0) return `${a} / ${b}`;
  }
  return "1 / 1";
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

async function downloadAsset(url: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `joyai-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/** 默认 2 行省略；展开为浮层，不挤占下方文档流 */
function StudioPrompt({ text }: { text: string }) {
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

  return (
    <div ref={wrapRef} className="joy-studio-prompt-wrap">
      <p
        ref={clampRef}
        className={cn(
          "joy-studio-prompt is-clamp",
          overflow && "is-overflow",
          open && "is-open-anchor",
        )}
        title={overflow ? "点击展开全文" : undefined}
        onClick={() => {
          if (overflow) setOpen((v) => !v);
        }}
      >
        {text}
      </p>
      {open ? (
        <div className="joy-studio-prompt-pop" role="dialog" aria-label="完整提示词">
          <p className="joy-studio-prompt-pop-text">{text}</p>
          <button
            type="button"
            className="joy-studio-prompt-pop-close"
            onClick={() => setOpen(false)}
          >
            收起
          </button>
        </div>
      ) : null}
    </div>
  );
}

function JobActions({
  job,
  regeneratingId,
  deletingId,
  onReedit,
  onRegenerate,
  onDelete,
}: {
  job: Job;
  regeneratingId: string | null;
  deletingId: string | null;
  onReedit: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="joy-studio-actions">
      <button type="button" className="joy-studio-action" onClick={onReedit}>
        <Pencil className="h-3.5 w-3.5" />
        重新编辑
      </button>
      <button
        type="button"
        className="joy-studio-action"
        disabled={regeneratingId === job.id || !job.input?.prompt}
        onClick={onRegenerate}
      >
        <RefreshCw
          className={cn(
            "h-3.5 w-3.5",
            regeneratingId === job.id && "animate-spin",
          )}
        />
        再次生成
      </button>
      <button
        type="button"
        className="joy-studio-action-icon is-danger"
        aria-label="删除"
        disabled={deletingId === job.id}
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function StudioInner() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
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
    socket.on("job:completed", refresh);
    socket.on("job:failed", refresh);
    socket.on("job:progress", refresh);
    return () => {
      socket.off("job:completed", refresh);
      socket.off("job:failed", refresh);
      socket.off("job:progress", refresh);
    };
  }, [loadInitial, refreshLatest]);

  const hasJobs = jobs.length > 0;

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

  function reedit(job: Job) {
    const prompt = job.input?.prompt?.trim();
    if (!prompt) {
      toast.error("没有可编辑的提示词");
      return;
    }
    setRemixPrompt(prompt);
    setRemixKey((k) => k + 1);
    toast.message("已填入提示词，可继续修改后生成");
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
              const sizeMeta = jobSizeMeta(job);
              const subMeta = jobSubMeta(job, assets.length);
              const skeletonCount = Math.min(
                Math.max(job.input?.n ?? (job.kind === "image" ? 2 : 1), 1),
                4,
              );
              const ar = aspectCss(job.input);
              const gridCount =
                assets.length > 0 ? assets.length : skeletonCount;

              return (
                <article key={job.id} className="joy-studio-job">
                  <div className="joy-studio-prompt-block">
                    {sizeMeta ? (
                      <p className="joy-studio-meta">{sizeMeta}</p>
                    ) : null}
                    <StudioPrompt text={job.input?.prompt || "未命名创作"} />
                    {subMeta ? (
                      <p className="joy-studio-meta joy-studio-meta-sub">
                        {subMeta}
                      </p>
                    ) : null}
                    {job.error ? (
                      <p className="joy-studio-error">{job.error}</p>
                    ) : null}
                  </div>

                  {assets.length > 0 ? (
                    <div
                      className={cn(
                        "joy-studio-grid",
                        gridCount === 1 && "is-single",
                        gridCount >= 2 && "is-multi",
                      )}
                    >
                      {assets.map((asset) =>
                        isVideoAsset(asset) ? (
                          <div
                            key={asset.id}
                            className="joy-studio-thumb"
                            style={{ aspectRatio: ar }}
                          >
                            <video src={asset.url} controls playsInline />
                          </div>
                        ) : (
                          <div
                            key={asset.id}
                            className="joy-studio-thumb-frame"
                            style={{ aspectRatio: ar }}
                          >
                            <PhotoView src={asset.url}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={asset.url} alt="" />
                            </PhotoView>
                            <div className="joy-studio-thumb-hover">
                              <div className="joy-studio-thumb-hover-top">
                                <button
                                  type="button"
                                  className="joy-studio-thumb-tool"
                                  aria-label="下载"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void downloadAsset(asset.url);
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
                    <div
                      className={cn(
                        "joy-studio-grid",
                        gridCount === 1 && "is-single",
                        gridCount >= 2 && "is-multi",
                      )}
                    >
                      {Array.from({ length: skeletonCount }).map((_, i) => (
                        <div
                          key={`${job.id}-sk-${i}`}
                          className="joy-studio-thumb-skeleton"
                          style={{ aspectRatio: ar }}
                        />
                      ))}
                    </div>
                  ) : null}

                  <JobActions
                    job={job}
                    regeneratingId={regeneratingId}
                    deletingId={deletingId}
                    onReedit={() => reedit(job)}
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
