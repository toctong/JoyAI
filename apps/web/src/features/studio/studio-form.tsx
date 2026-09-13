"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";
import {
  FolderOpen,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
};

type Job = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
  input?: JobInput;
  assets?: Asset[];
  error?: string | null;
};

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

function jobMeta(job: Job) {
  const parts = [
    aspectLabel(job.input),
    qualityLabel(job.input),
    job.kind === "video" ? "视频" : null,
  ].filter(Boolean);
  return parts.join(" | ");
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

function StudioInner() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [remixKey, setRemixKey] = useState(0);
  const [remixPrompt, setRemixPrompt] = useState<string | undefined>();
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    const list = await api<Job[]>("/jobs?take=30");
    setJobs(list);
  }, []);

  useEffect(() => {
    void loadJobs();
    const socket = getJobsSocket();
    const refresh = () => void loadJobs();
    socket.on("job:completed", refresh);
    socket.on("job:failed", refresh);
    socket.on("job:progress", refresh);
    return () => {
      socket.off("job:completed", refresh);
      socket.off("job:failed", refresh);
      socket.off("job:progress", refresh);
    };
  }, [loadJobs]);

  const hasJobs = jobs.length > 0;

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
      await loadJobs();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "再次生成失败");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function copyPrompt(job: Job) {
    const text = job.input?.prompt?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("提示词已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  const feed = useMemo(() => jobs, [jobs]);

  return (
    <div className="joy-studio">
      <div className="joy-studio-top">
        <Link href="/assets" className="joy-studio-assets-btn">
          <FolderOpen className="h-3.5 w-3.5" />
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
          <PhotoProvider>
            {feed.map((job) => {
              const assets = job.assets ?? [];
              const busy = isBusy(job.status);
              const meta = jobMeta(job);
              const skeletonCount = Math.min(
                Math.max(job.input?.n ?? (job.kind === "image" ? 2 : 1), 1),
                4,
              );

              return (
                <article key={job.id} className="joy-studio-job">
                  <div className="joy-studio-actions">
                    <button
                      type="button"
                      className="joy-studio-action"
                      onClick={() => reedit(job)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      重新编辑
                    </button>
                    <button
                      type="button"
                      className="joy-studio-action"
                      disabled={regeneratingId === job.id || !job.input?.prompt}
                      onClick={() => void regenerate(job)}
                    >
                      <RefreshCw
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
                          className="joy-studio-action-icon"
                          aria-label="更多"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-36">
                        <DropdownMenuItem onClick={() => void copyPrompt(job)}>
                          复制提示词
                        </DropdownMenuItem>
                        {assets[0] ? (
                          <DropdownMenuItem asChild>
                            <a
                              href={assets[0].url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              打开原图
                            </a>
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="joy-studio-prompt-block">
                    {meta ? <p className="joy-studio-meta">{meta}</p> : null}
                    <p className="joy-studio-prompt">
                      {job.input?.prompt || "未命名创作"}
                    </p>
                    {busy ? (
                      <div className="joy-studio-status">
                        <Progress value={job.progress ?? 18} />
                      </div>
                    ) : null}
                    {job.error ? (
                      <p className="joy-studio-error">{job.error}</p>
                    ) : null}
                  </div>

                  {assets.length > 0 ? (
                    <div
                      className={cn(
                        "joy-studio-grid",
                        assets.length === 1 && "is-single",
                      )}
                    >
                      {assets.map((asset) =>
                        isVideoAsset(asset) ? (
                          <div key={asset.id} className="joy-studio-thumb">
                            <video src={asset.url} controls playsInline />
                          </div>
                        ) : (
                          <PhotoView key={asset.id} src={asset.url}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset.url}
                              alt=""
                              className="joy-studio-thumb"
                            />
                          </PhotoView>
                        ),
                      )}
                    </div>
                  ) : busy ? (
                    <div
                      className={cn(
                        "joy-studio-grid",
                        skeletonCount === 1 && "is-single",
                      )}
                    >
                      {Array.from({ length: skeletonCount }).map((_, i) => (
                        <div
                          key={`${job.id}-sk-${i}`}
                          className="joy-studio-thumb-skeleton"
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </PhotoProvider>
          <p className="joy-studio-end">没有更多内容了</p>
        </div>
      )}

      <div className="joy-studio-dock">
        <div className="joy-studio-dock-glow" aria-hidden />
        <div className="joy-studio-dock-inner">
          <CreationComposer
            key={`dock-${remixKey}`}
            variant="dock"
            promptSeed={remixPrompt}
            onSubmitted={() => void loadJobs()}
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
