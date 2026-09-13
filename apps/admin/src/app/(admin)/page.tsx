"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Boxes,
  Briefcase,
  RefreshCw,
  Users,
  Waypoints,
} from "lucide-react";
import { api } from "@/shared/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListPageCard } from "@/components/admin/list-page";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobStatusBadge } from "@/components/admin/status-badge";
import dayjs from "dayjs";

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
  user?: { username: string };
  input?: { prompt?: string };
  error?: string | null;
};

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

  async function load() {
    setLoading(true);
    try {
      const [users, jobs, channels, models] = await Promise.all([
        api<unknown[]>("/admin/users"),
        api<Job[]>("/admin/jobs?take=100"),
        api<unknown[]>("/admin/channels"),
        api<unknown[]>("/admin/models"),
      ]);
      const running = jobs.filter((j) =>
        ["queued", "running", "polling"].includes(j.status),
      ).length;
      const failed = jobs.filter((j) => j.status === "failed").length;
      setCounts({
        users: users.length,
        jobs: jobs.length,
        channels: channels.length,
        models: models.length,
        running,
        failed,
      });
      setRecent(jobs.slice(0, 8));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="概览"
        description="平台运行概况"
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void load()}
          >
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="用户"
          value={counts.users}
          icon={Users}
          loading={loading}
          hint="全部账号"
        />
        <StatCard
          title="渠道"
          value={counts.channels}
          icon={Waypoints}
          loading={loading}
          hint="上游供应商"
        />
        <StatCard
          title="模型"
          value={counts.models}
          icon={Boxes}
          loading={loading}
          hint="已登记模型"
        />
        <StatCard
          title="进行中任务"
          value={counts.running}
          icon={Activity}
          tone={counts.running > 0 ? "warn" : "ok"}
          loading={loading}
          hint={`最近 ${counts.jobs} 条 · 失败 ${counts.failed}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <ListPageCard>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Briefcase className="size-4 text-primary" />
              最近任务
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jobs">查看全部</Link>
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    {job.user?.username ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {job.kind === "image" ? "图片" : "视频"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <JobStatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dayjs(job.createdAt).format("MM-DD HH:mm")}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && recent.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-8 text-center text-muted-foreground"
                  >
                    暂无任务
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </ListPageCard>

        <ListPageCard className="p-4">
          <h2 className="mb-3 text-sm font-medium">快捷入口</h2>
          <div className="grid gap-2">
            {[
              { href: "/channels", label: "配置渠道", desc: "火山 / 多厂商" },
              { href: "/models", label: "登记模型", desc: "图片 / 视频" },
              { href: "/settings", label: "系统设置", desc: "TOS 与开关" },
              { href: "/users", label: "用户管理", desc: "角色与账号" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg border border-border px-3 py-2.5 transition hover:border-primary/40 hover:bg-accent/50"
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.desc}</div>
              </Link>
            ))}
          </div>
        </ListPageCard>
      </div>
    </div>
  );
}
