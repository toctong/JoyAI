"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ChevronRight,
  LayoutGrid,
  Puzzle,
  RefreshCw,
  Settings,
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

type Counts = {
  users: number;
  jobs: number;
  channels: number;
  models: number;
  running: number;
  failed: number;
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

const QUICK_LINKS: {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}[] = [
  { href: "/admin/jobs", label: "任务监控", desc: "队列与状态", icon: MonitorActivity },
  { href: "/admin/channels", label: "配置渠道", desc: "上游供应商", icon: Waypoints },
  { href: "/admin/models", label: "登记模型", desc: "图片 / 视频", icon: LayoutGrid },
  { href: "/admin/plugins", label: "插件管理", desc: "扩展能力", icon: Puzzle },
  { href: "/admin/users", label: "用户管理", desc: "角色与账号", icon: Users },
  { href: "/admin/settings", label: "系统设置", desc: "TOS 与开关", icon: Settings },
];

function MetricLink({
  href,
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
  loading,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  tone?: "slate" | "sky" | "ok" | "warn";
  loading?: boolean;
}) {
  return (
    <Link href={href} className="joy-ov-metric" data-tone={tone}>
      <div className="joy-ov-metric-head">
        <span className="joy-ov-metric-label">{label}</span>
        <span className="joy-ov-metric-icon">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="joy-ov-metric-value">
        {loading ? <span className="joy-ov-metric-skel" /> : value}
      </div>
      <div className="joy-ov-metric-hint">
        {loading ? <span className="joy-ov-metric-skel-sm" /> : hint}
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<Counts>({
    users: 0,
    jobs: 0,
    channels: 0,
    models: 0,
    running: 0,
    failed: 0,
  });
  const [recent, setRecent] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [users, jobs, channels, models] = await Promise.all([
        api<unknown[]>("/admin/users"),
        api<Job[]>("/admin/jobs?take=100"),
        api<{ total: number }>("/admin/channels?page=1&pageSize=1"),
        api<{ total: number }>("/admin/models?page=1&pageSize=1"),
      ]);
      const running = jobs.filter((j) =>
        ["queued", "running", "polling"].includes(j.status),
      ).length;
      const failed = jobs.filter((j) => j.status === "failed").length;
      setCounts({
        users: users.length,
        jobs: jobs.length,
        channels: channels.total ?? 0,
        models: models.total ?? 0,
        running,
        failed,
      });
      setRecent(jobs.slice(0, 8));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = counts.running > 0;
  const statusLabel = loading
    ? "同步中…"
    : busy
      ? `${counts.running} 个任务进行中`
      : counts.failed > 0
        ? `运行平稳 · ${counts.failed} 条失败待关注`
        : "运行平稳";

  return (
    <div className="joy-ov">
      <section className="joy-ov-hero">
        <div className="joy-ov-hero-top">
          <div className="min-w-0">
            <p className="joy-ov-kicker">Control Center</p>
            <h1 className="joy-ov-title">概览</h1>
            <p className="joy-ov-desc">
              一眼掌握账号、上游与生成队列，从这里进入日常运维。
            </p>
          </div>
          <div className="joy-ov-hero-actions">
            <div className="joy-ov-pulse" aria-live="polite">
              <span
                className={cn(
                  "joy-ov-pulse-dot",
                  busy && "is-warn is-busy",
                  !loading && counts.failed > 0 && !busy && "is-warn",
                )}
              />
              {statusLabel}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="size-9 rounded-xl border border-border/70 bg-background/70 shadow-none backdrop-blur-sm"
              disabled={refreshing || loading}
              onClick={() => void load(true)}
              aria-label="刷新"
              title="刷新"
            >
              <RefreshCw
                className={cn(
                  "size-3.5",
                  (refreshing || loading) && "animate-spin",
                )}
              />
            </Button>
          </div>
        </div>
      </section>

      <section className="joy-ov-metrics" aria-label="关键指标">
        <MetricLink
          href="/admin/users"
          label="用户"
          value={counts.users}
          hint="全部账号"
          icon={Users}
          tone="slate"
          loading={loading}
        />
        <MetricLink
          href="/admin/channels"
          label="渠道"
          value={counts.channels}
          hint="上游供应商"
          icon={Waypoints}
          tone="sky"
          loading={loading}
        />
        <MetricLink
          href="/admin/models"
          label="模型"
          value={counts.models}
          hint="已登记模型"
          icon={LayoutGrid}
          tone="sky"
          loading={loading}
        />
        <MetricLink
          href="/admin/jobs"
          label="进行中"
          value={counts.running}
          hint={`近 ${counts.jobs} 条 · 失败 ${counts.failed}`}
          icon={Activity}
          tone={busy ? "warn" : "ok"}
          loading={loading}
        />
      </section>

      <section className="joy-ov-stage">
        <article className="joy-ov-panel">
          <div className="joy-ov-panel-head">
            <div>
              <h2 className="joy-ov-panel-title">
                <MonitorActivity className="size-4" />
                最近任务
              </h2>
              <p className="joy-ov-panel-sub">平台最新生成动态</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="h-8 rounded-lg">
              <Link href="/admin/jobs" className="gap-1">
                查看全部
                <ChevronRight className="size-3.5 opacity-60" />
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="joy-ov-jobs">
              {Array.from({ length: 5 }).map((_, i) => (
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
              {recent.map((job) => (
                <div key={job.id} className="joy-ov-job">
                  <div className="joy-ov-job-main">
                    <span className="joy-ov-job-user">
                      {job.user?.username ?? "—"}
                    </span>
                    <div className="joy-ov-job-meta">
                      <Badge variant="secondary" className="rounded-md px-1.5">
                        {job.kind === "image" ? "图片" : "视频"}
                      </Badge>
                      <JobStatusBadge status={job.status} />
                      {job.channelName ? (
                        <span className="text-muted-foreground">
                          {job.channelName}
                        </span>
                      ) : null}
                      {job.modelName ? (
                        <span className="text-muted-foreground">
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
        </article>

        <aside className="joy-ov-panel">
          <div className="joy-ov-panel-head">
            <div>
              <h2 className="joy-ov-panel-title">快捷入口</h2>
              <p className="joy-ov-panel-sub is-flush">常用运维一键直达</p>
            </div>
          </div>
          <nav className="joy-ov-nav" aria-label="快捷入口">
            {QUICK_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="joy-ov-nav-item"
                >
                  <span className="joy-ov-nav-icon">
                    <Icon className="size-3.5 opacity-80" />
                  </span>
                  <span>
                    <span className="joy-ov-nav-label">{item.label}</span>
                    <span className="joy-ov-nav-desc">{item.desc}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>
      </section>
    </div>
  );
}
