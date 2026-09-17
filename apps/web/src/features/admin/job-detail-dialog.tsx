"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import dayjs from "dayjs";
import { Copy, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { copyText } from "@/shared/lib/clipboard";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import { JobStatusBadge } from "@/components/admin/status-badge";
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ExplorePlyrPlayer } from "@/features/explore/explore-plyr-player";
import { ExploreDialogSkeleton } from "@/features/explore/explore-skeleton";
import "@/features/explore/explore-detail-dialog.css";
import "./job-detail-dialog.css";

export type JobDetailAsset = {
  id: string;
  url: string;
  kind?: string;
  mimeType?: string | null;
};

export type JobDetailInput = {
  prompt?: string;
  negativePrompt?: string;
  modelId?: string;
  ratio?: string;
  resolution?: string;
  size?: string;
  duration?: number;
  n?: number;
  width?: number;
  height?: number;
  referenceUrls?: string[];
  referenceAssetIds?: string[];
  refMode?: string;
  [key: string]: unknown;
};

export type JobDetail = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  updatedAt?: string;
  durationMs?: number | null;
  error?: string | null;
  remoteTaskId?: string | null;
  modelId?: string | null;
  modelName?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  platform?: string | null;
  user?: { id?: string; username: string };
  input?: JobDetailInput | null;
  result?: Record<string, unknown> | null;
  assets?: JobDetailAsset[];
};

type Props = {
  job: JobDetail | null;
  open: boolean;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
};

function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  return kind;
}

function formatTs(value?: string | null) {
  if (!value) return "—";
  return dayjs(value).format("YYYY-MM-DD HH:mm:ss");
}

function isVideoUrl(url: string, kind?: string) {
  return kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function MetaChip({ children }: { children: ReactNode }) {
  return <span className="joy-job-dialog-chip">{children}</span>;
}

export function JobDetailDialog({
  job,
  open,
  loading,
  onOpenChange,
}: Props) {
  const [mediaIndex, setMediaIndex] = useState(0);
  const [ready, setReady] = useState(false);

  const assets = job?.assets ?? [];
  const input = job?.input ?? null;
  const refUrls = input?.referenceUrls?.filter(Boolean) ?? [];

  const mediaItems = useMemo(() => {
    if (assets.length > 0) {
      return assets.map((a) => ({
        id: a.id,
        url: a.url,
        video: isVideoUrl(a.url, a.kind),
      }));
    }
    return refUrls.map((url, i) => ({
      id: `ref-${i}`,
      url,
      video: false,
    }));
  }, [assets, refUrls]);

  const active = mediaItems[mediaIndex] ?? mediaItems[0] ?? null;

  useEffect(() => {
    setMediaIndex(0);
    setReady(false);
  }, [job?.id, open]);

  useEffect(() => {
    if (!open || !job) return;
    if (mediaItems.length === 0) setReady(true);
  }, [open, job, mediaItems.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !job || ready) return;
    const t = window.setTimeout(() => setReady(true), 8000);
    return () => window.clearTimeout(t);
  }, [open, job, ready]);

  const markReady = useCallback(() => setReady(true), []);

  async function copyPrompt() {
    const text = input?.prompt?.trim();
    if (!text) {
      toast.error("没有可复制的提示词");
      return;
    }
    if (await copyText(text)) {
      toast.success("提示词已复制");
    } else {
      toast.error("复制失败");
    }
  }

  const paramChips = [
    kindLabel(job?.kind ?? ""),
    input?.resolution || input?.size,
    input?.ratio,
    input?.duration != null ? `${input.duration}s` : null,
    input?.n != null && input.n > 1 ? `${input.n}张` : null,
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="joy-explore-dialog-overlay" />
        <DialogPrimitive.Content
          className={cn(
            "joy-explore-dialog",
            "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
            "outline-none data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">
            {job ? `任务详情 ${job.id}` : "任务详情"}
          </DialogTitle>

          <DialogClose className="joy-explore-dialog-close" aria-label="关闭">
            <X className="h-4 w-4" />
          </DialogClose>

          {job ? (
            <div className="joy-explore-dialog-inner">
              <div
                className={cn(
                  "joy-explore-dialog-media",
                  mediaItems.length > 1 && "joy-job-dialog-media-stack",
                )}
              >
                <div className="joy-explore-dialog-stage">
                  {active ? (
                    <>
                      {active.video ? (
                        <video
                          src={active.url}
                          muted
                          playsInline
                          autoPlay
                          loop
                          aria-hidden
                          className="joy-explore-dialog-blur"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={active.url}
                          alt=""
                          aria-hidden
                          className="joy-explore-dialog-blur"
                        />
                      )}
                      <div className="joy-explore-dialog-fg">
                        {active.video ? (
                          <ExplorePlyrPlayer
                            key={active.id}
                            src={active.url}
                            className="joy-explore-dialog-media-el"
                            onReady={markReady}
                            onError={markReady}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={active.url}
                            alt=""
                            className="joy-explore-dialog-media-el"
                            onLoad={markReady}
                            onError={markReady}
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="joy-job-dialog-empty-media">
                      {job.status === "failed"
                        ? "生成失败，无产出预览"
                        : "暂无媒体预览"}
                    </div>
                  )}
                </div>

                {mediaItems.length > 1 ? (
                  <div className="joy-job-dialog-thumbs">
                    {mediaItems.map((item, i) => (
                      <button
                        key={item.id}
                        type="button"
                        className={cn(
                          "joy-job-dialog-thumb",
                          i === mediaIndex && "is-active",
                        )}
                        onClick={() => {
                          setMediaIndex(i);
                          setReady(false);
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.url} alt="" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <aside className="joy-explore-dialog-side joy-job-dialog-side">
                <div className="joy-explore-dialog-side-top">
                  <div className="joy-explore-dialog-user">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={JOYAI_BRAND.remote.avatar}
                      alt=""
                      className="joy-explore-dialog-avatar"
                    />
                    <div className="min-w-0">
                      <div className="joy-explore-dialog-name">
                        {job.user?.username ?? "未知用户"}
                      </div>
                      <div className="joy-job-dialog-sub">
                        {formatTs(job.createdAt)}
                        {job.durationMs != null ? (
                          <> · 用时 {formatDurationMs(job.durationMs)}</>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="joy-job-dialog-status">
                    <JobStatusBadge status={job.status} />
                    {loading ? (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>
                </div>

                {(job.modelName || job.channelName) && (
                  <div className="joy-explore-dialog-model">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {[job.modelName, job.channelName]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                )}

                {paramChips.length > 0 ? (
                  <div className="joy-job-dialog-chips">
                    {paramChips.map((c) => (
                      <MetaChip key={c}>{c}</MetaChip>
                    ))}
                  </div>
                ) : null}

                <div className="joy-explore-dialog-prompt-head">
                  <span>提示词</span>
                  <button
                    type="button"
                    className="joy-explore-dialog-copy"
                    onClick={() => void copyPrompt()}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>

                <div className="joy-explore-dialog-prompt">
                  {input?.prompt?.trim() || "（无提示词）"}
                </div>

                {job.error ? (
                  <div className="joy-job-dialog-error">
                    <div className="joy-job-dialog-error-label">错误信息</div>
                    <pre>{job.error}</pre>
                  </div>
                ) : null}

                <div className="joy-job-dialog-meta">
                  <div className="joy-job-dialog-meta-grid">
                    <span>任务 ID</span>
                    <code title={job.id}>{job.id}</code>
                    <span>远端任务</span>
                    <code title={job.remoteTaskId || undefined}>
                      {job.remoteTaskId || "—"}
                    </code>
                    <span>开始</span>
                    <span>{formatTs(job.startedAt)}</span>
                    <span>结束</span>
                    <span>{formatTs(job.finishedAt)}</span>
                    {input?.refMode ? (
                      <>
                        <span>参考模式</span>
                        <span>{input.refMode}</span>
                      </>
                    ) : null}
                    {refUrls.length > 0 ? (
                      <>
                        <span>参考图</span>
                        <span>{refUrls.length} 张</span>
                      </>
                    ) : null}
                    {assets.length > 0 ? (
                      <>
                        <span>产出</span>
                        <span>{assets.length} 个资产</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </aside>
            </div>
          ) : null}

          {!ready ? (
            <div className="joy-explore-dialog-skel-layer">
              <ExploreDialogSkeleton />
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
