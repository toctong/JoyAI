"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Aperture,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  ImageIcon,
  LayoutGrid,
  Mic2,
  RefreshCw,
  ScrollText,
  Sparkles,
  Users,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JobStatusBadge } from "@/components/admin/status-badge";
import { MonitorActivity } from "@/components/icons/monitor-activity";
import { cn } from "@/shared/lib/utils";
import "@/features/admin/admin-overview.css";

type PlatformCounts = {
  users: number;
  jobs: number;
  channels: number;
  models: number;
  running: number;
  failed: number;
  success: number;
};

type ContentCounts = {
  presets: number;
  styles: number;
  cameraMoves: number;
  voices: number;
  skills: number;
  banners: number;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  durationMs?: number | null;
  modelName?: string | null;
  channelName?: string | null;
  user?: { username: string };
  input?: { prompt?: string };
  error?: string | null;
};

type CatalogItem = {
  key: keyof ContentCounts;
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const CATALOG: CatalogItem[] = [
  {
    key: "presets",
    href: "/admin/prompt-presets",
    label: "提示词",
    hint: "全局预设",
    icon: ScrollText,
  },
  {
    key: "styles",
    href: "/admin/styles",
    label: "风格",
    hint: "漫剧 / 画布",
    icon: Sparkles,
  },
  {
    key: "cameraMoves",
    href: "/admin/camera-moves",
    label: "运镜",
    hint: "镜头运动",
    icon: Aperture,
  },
  {
    key: "voices",
    href: "/admin/voices",
    label: "音色库",
    hint: "TTS 音色",
    icon: Mic2,
  },
  {
    key: "skills",
    href: "/admin/skills",
    label: "技能",
    hint: "能力清单",
    icon: Clapperboard,
  },
  {
    key: "banners",
    href: "/admin/inspire-banners",
    label: "横幅",
    hint: "灵感页",
    icon: ImageIcon,
  },
];

function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  if (kind === "llm") return "LLM";
  if (kind === "audio") return "音频";
  return kind;
}

function arrayLen(data: unknown): number {
  return Array.isArray(data) ? data.length : 0;
}

async function safeLen(path: string) {
  try {
    return arrayLen(await api<unknown>(path));
  } catch {
    return 0;
  }
}

function MetricCard({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
  loading,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone?: "blue" | "violet" | "green" | "orange";
  loading?: boolean;
}) {
  return (
    <Link href={href} className="joy-ov-metric" data-tone={tone}>
      <div className="joy-ov-metric-icon" aria-hidden>
        <Icon className="size-5" />
      </div>
      <div className="joy-ov-metric-body">
        <div className="joy-ov-metric-label">{label}</div>
        <div className="joy-ov-metric-value">
          {loading ? <span className="joy-ov-metric-skel" /> : value}
        </div>
        <div className="joy-ov-metric-hint">
          {loading ? <span className="joy-ov-metric-skel-sm" /> : hint}
        </div>
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<PlatformCounts>({
    users: 0,
    jobs: 0,
    channels: 0,
    models: 0,
    running: 0,
    failed: 0,
    success: 0,
  });
  const [content, setContent] = useState<ContentCounts>({
    presets: 0,
    styles: 0,
    cameraMoves: 0,
    voices: 0,
    skills: 0,
    banners: 0,
  });
  const [recent, setRecent] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [
        users,
        jobsRes,
        channels,
        models,
        presets,
        styles,
        cameraMoves,
        voices,
        skills,
        banners,
      ] = await Promise.all([
        api<unknown[]>("/admin/users").catch(() => []),
        api<{ items: Job[]; total: number }>(
          "/admin/jobs?page=1&pageSize=100",
        ).catch(() => ({ items: [] as Job[], total: 0 })),
        api<{ total: number }>("/admin/channels?page=1&pageSize=1").catch(
          () => ({ total: 0 }),
        ),
        api<{ total: number }>("/admin/models?page=1&pageSize=1").catch(
          () => ({ total: 0 }),
        ),
        safeLen("/admin/prompt-presets"),
        safeLen("/admin/styles"),
        safeLen("/admin/camera-moves"),
        safeLen("/admin/voices"),
        safeLen("/admin/skills"),
        safeLen("/admin/inspire-banners"),
      ]);
      const jobs = jobsRes.items ?? [];
      const running = jobs.filter((j) =>
        ["queued", "running", "polling"].includes(j.status),
      ).length;
      const failed = jobs.filter((j) => j.status === "failed").length;
      const success = jobs.filter((j) => j.status === "succeeded").length;
      setCounts({
        users: Array.isArray(users) ? users.length : 0,
        jobs: jobsRes.total ?? jobs.length,
        channels: channels.total ?? 0,
        models: models.total ?? 0,
        running,
        failed,
        success,
      });
      setContent({
        presets,
        styles,
        cameraMoves,
        voices,
        skills,
        banners,
      });
      setRecent(jobs.slice(0, 12));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = counts.running > 0;
  const healthTone = loading
    ? "neutral"
    : busy
      ? "warn"
      : counts.failed > 0
        ? "warn"
        : "ok";
  const statusLabel = loading
    ? "正在同步平台状态…"
    : busy
      ? `有 ${counts.running} 个任务进行中`
      : counts.failed > 0
        ? `整体平稳，近窗有 ${counts.failed} 条失败待关注`
        : "平台运行平稳";

  return (
    <div className="joy-ov h-full overflow-y-auto">
      <header className="joy-ov-header">
        <div className="min-w-0">
          <h1 className="joy-ov-title">概览</h1>
          <p className="joy-ov-desc">
            查看平台资源、内容库规模与最近生成队列。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5 rounded-xl shadow-none"
          disabled={refreshing || loading}
          onClick={() => void load(true)}
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              (refreshing || loading) && "animate-spin",
            )}
          />
          刷新
        </Button>
      </header>

      <div
        className={cn("joy-ov-health", `is-${healthTone}`)}
        aria-live="polite"
      >
        <div className="joy-ov-health-main">
          {healthTone === "ok" ? (
            <CheckCircle2 className="size-4" />
          ) : healthTone === "warn" ? (
            <AlertTriangle className="size-4" />
          ) : (
            <Activity className="size-4" />
          )}
          <span>{statusLabel}</span>
        </div>
        <div className="joy-ov-health-stats">
          <span>
            成功 <b>{loading ? "—" : counts.success}</b>
          </span>
          <span>
            进行中 <b>{loading ? "—" : counts.running}</b>
          </span>
          <span>
            失败 <b>{loading ? "—" : counts.failed}</b>
          </span>
        </div>
      </div>

      <section className="joy-ov-section" aria-label="平台资源">
        <div className="joy-ov-section-head">
          <h2 className="joy-ov-section-title">平台资源</h2>
          <p className="joy-ov-section-sub">账号、渠道、模型与任务总量</p>
        </div>
        <div className="joy-ov-metrics">
          <MetricCard
            href="/admin/users"
            label="用户"
            value={counts.users}
            hint="全部账号"
            icon={Users}
            tone="blue"
            loading={loading}
          />
          <MetricCard
            href="/admin/channels"
            label="渠道"
            value={counts.channels}
            hint="上游供应商"
            icon={Waypoints}
            tone="violet"
            loading={loading}
          />
          <MetricCard
            href="/admin/models"
            label="模型"
            value={counts.models}
            hint="已登记模型"
            icon={LayoutGrid}
            tone="blue"
            loading={loading}
          />
          <MetricCard
            href="/admin/jobs"
            label="任务总量"
            value={counts.jobs}
            hint={`近窗失败 ${counts.failed}`}
            icon={Activity}
            tone={busy || counts.failed > 0 ? "orange" : "green"}
            loading={loading}
          />
        </div>
      </section>

      <section className="joy-ov-section" aria-label="内容库">
        <div className="joy-ov-section-head">
          <h2 className="joy-ov-section-title">内容库</h2>
          <p className="joy-ov-section-sub">
            提示词 / 风格 / 运镜 / 音色 / 技能 / 横幅
          </p>
        </div>
        <div className="joy-ov-catalog">
          {CATALOG.map((item) => {
            const Icon = item.icon;
            const value = content[item.key];
            return (
              <Link
                key={item.key}
                href={item.href}
                className="joy-ov-catalog-item"
              >
                <div className="joy-ov-catalog-top">
                  <span className="joy-ov-catalog-icon" aria-hidden>
                    <Icon className="size-4" />
                  </span>
                  <ChevronRight className="joy-ov-catalog-go size-3.5" />
                </div>
                <div>
                  <p className="joy-ov-catalog-label">{item.label}</p>
                  <p className="joy-ov-catalog-value">
                    {loading ? (
                      <span className="joy-ov-metric-skel" />
                    ) : (
                      value
                    )}
                  </p>
                  <p className="joy-ov-catalog-hint">{item.hint}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="joy-ov-section" aria-label="最近任务">
        <div className="joy-ov-panel">
          <div className="joy-ov-panel-head">
            <div>
              <h2 className="joy-ov-panel-title">
                <MonitorActivity className="size-4" />
                最近任务
              </h2>
              <p className="joy-ov-panel-sub">平台最新生成动态</p>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 rounded-xl px-2"
            >
              <Link href="/admin/jobs" className="gap-1 text-[12px]">
                查看全部
                <ChevronRight className="size-3.5 opacity-60" />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="joy-ov-jobs">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="joy-ov-job-skel">
                  <div className="joy-ov-job-skel-left">
                    <span className="joy-ov-skel-user" />
                    <span className="joy-ov-skel-chip" />
                    <span className="joy-ov-skel-chip" />
                  </div>
                  <span className="joy-ov-skel-time" />
                </div>
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="joy-ov-empty">
              <p className="joy-ov-empty-title">暂无任务</p>
              <p className="joy-ov-empty-desc">生成任务出现后会显示在这里</p>
            </div>
          ) : (
            <div className="joy-ov-jobs">
              <div className="joy-ov-jobs-head" aria-hidden>
                <span>用户 / 详情</span>
                <span>时间</span>
              </div>
              {recent.map((job) => (
                <div key={job.id} className="joy-ov-job">
                  <div className="joy-ov-job-main">
                    <span className="joy-ov-job-user">
                      {job.user?.username ?? "—"}
                    </span>
                    <div className="joy-ov-job-meta">
                      <Badge
                        variant="secondary"
                        className="rounded-xl px-1.5 text-[10px] font-normal"
                      >
                        {kindLabel(job.kind)}
                      </Badge>
                      <JobStatusBadge status={job.status} />
                      {job.channelName ? (
                        <span className="text-muted-foreground">
                          {job.channelName}
                        </span>
                      ) : null}
                      {job.modelName ? (
                        <span className="truncate text-muted-foreground">
                          {job.modelName}
                        </span>
                      ) : null}
                      {typeof job.durationMs === "number" ? (
                        <span className="tabular-nums text-muted-foreground">
                          {formatDurationMs(job.durationMs)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <time
                    className="joy-ov-job-time"
                    dateTime={job.createdAt}
                    title={dayjs(job.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                  >
                    {dayjs(job.createdAt).format("MM-DD HH:mm")}
                  </time>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
