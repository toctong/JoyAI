"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { formatDurationMs } from "@/shared/lib/format-duration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import {
  ListPageCard,
  ListPageHeader,
  ListPageMain,
  ListPageShell,
} from "@/components/admin/list-page";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { JobStatusBadge } from "@/components/admin/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  JobDetailDialog,
  type JobDetail,
} from "@/features/admin/job-detail-dialog";

type Job = JobDetail;

function kindLabel(kind: string) {
  if (kind === "image") return "图片";
  if (kind === "video") return "视频";
  return kind;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Job | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setJobs(await api<Job[]>("/admin/jobs?take=200"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载任务失败");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (kindFilter !== "all" && j.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        j.id.toLowerCase().includes(q) ||
        (j.user?.username ?? "").toLowerCase().includes(q) ||
        (j.input?.prompt ?? "").toLowerCase().includes(q) ||
        (j.modelName ?? "").toLowerCase().includes(q) ||
        (j.channelName ?? "").toLowerCase().includes(q) ||
        (j.platform ?? "").toLowerCase().includes(q) ||
        (j.error ?? "").toLowerCase().includes(q) ||
        (j.remoteTaskId ?? "").toLowerCase().includes(q)
      );
    });
  }, [jobs, search, statusFilter, kindFilter]);

  async function openDetail(job: Job) {
    setDetail(job);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await api<Job>(`/admin/jobs/${job.id}`);
      setDetail(full);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载详情失败");
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="任务"
          description="全平台生成任务监控 · 点击详情查看完整信息"
          className="mb-0"
        />
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索用户 / 模型 / 渠道 / 提示词 / ID"
          filters={
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[120px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="queued">排队</SelectItem>
                  <SelectItem value="running">运行中</SelectItem>
                  <SelectItem value="polling">轮询中</SelectItem>
                  <SelectItem value="succeeded">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="h-9 w-[110px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="image">图片</SelectItem>
                  <SelectItem value="video">视频</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {filtered.length === 0 ? (
            <AdminEmptyState title={search ? "没有匹配任务" : "暂无任务"} />
          ) : (
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[88px]">用户</TableHead>
                  <TableHead className="w-[72px]">类型</TableHead>
                  <TableHead className="w-[110px]">渠道</TableHead>
                  <TableHead className="min-w-[140px]">模型</TableHead>
                  <TableHead className="w-[80px]">状态</TableHead>
                  <TableHead className="w-[88px]">用时</TableHead>
                  <TableHead>提示词</TableHead>
                  <TableHead className="w-[110px]">时间</TableHead>
                  <TableHead className="min-w-[140px]">错误</TableHead>
                  <TableHead className="admin-col-sticky-right w-[88px] text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">
                      {job.user?.username ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary">{kindLabel(job.kind)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-muted-foreground">
                      {job.channelName || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {job.modelName || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDurationMs(job.durationMs)}
                    </TableCell>
                    <TableCell
                      className="max-w-[240px] truncate text-muted-foreground"
                      title={job.input?.prompt || undefined}
                    >
                      {job.input?.prompt || "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {dayjs(job.createdAt).format("MM-DD HH:mm")}
                    </TableCell>
                    <TableCell
                      className="max-w-[180px] truncate text-xs text-destructive"
                      title={job.error || undefined}
                    >
                      {job.error || ""}
                    </TableCell>
                    <TableCell className="admin-col-sticky-right text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg px-2"
                        onClick={() => void openDetail(job)}
                      >
                        <Eye className="size-3.5" />
                        详情
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListPageCard>
      </ListPageMain>

      <JobDetailDialog
        job={detail}
        open={detailOpen}
        loading={detailLoading}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetail(null);
        }}
      />
    </ListPageShell>
  );
}

