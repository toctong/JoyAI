"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { buildAdminQuery } from "@/shared/lib/admin-query";
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
  ListPageFooter,
  ListPageHeader,
  ListPageMain,
  ListPageShell,
} from "@/components/admin/list-page";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { ListPagination } from "@/components/admin/list-pagination";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { AdminListSkeleton } from "@/components/admin/list-skeleton";
import { JobStatusBadge } from "@/components/admin/status-badge";
import { kindLabel } from "@/components/admin/model-meta";
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

type PaginatedJobs = {
  items: Job[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTIVE_STATUSES = new Set(["queued", "running", "polling"]);

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<Job | null>(null);
  const silentRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean; page?: number }) => {
      const nextPage = opts?.page ?? page;
      const silent = opts?.silent ?? false;
      if (!silent) setRefreshing(true);
      try {
        const res = await api<PaginatedJobs>(
          `/admin/jobs${buildAdminQuery({
            page: nextPage,
            pageSize,
            keyword: keyword.trim() || undefined,
            status: statusFilter === "all" ? undefined : statusFilter,
            kind: kindFilter === "all" ? undefined : kindFilter,
          })}`,
        );
        setJobs(res.items ?? []);
        setTotal(res.total ?? 0);
        setPage(res.page ?? nextPage);
        if ((res.items?.length ?? 0) === 0 && (res.total ?? 0) > 0 && (res.page ?? 1) > 1) {
          const maxPage = Math.max(1, Math.ceil(res.total / res.pageSize));
          if (maxPage < (res.page ?? 1)) {
            setPage(maxPage);
          }
        }
      } catch (e) {
        if (!silent) {
          toast.error(e instanceof Error ? e.message : "加载任务失败");
        }
      } finally {
        if (!silent) setRefreshing(false);
        setLoaded(true);
      }
    },
    [page, pageSize, keyword, statusFilter, kindFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const hasActive = jobs.some((j) => ACTIVE_STATUSES.has(j.status));

  useEffect(() => {
    if (!hasActive) return;
    const timer = window.setInterval(() => {
      if (silentRef.current) return;
      silentRef.current = true;
      void load({ silent: true }).finally(() => {
        silentRef.current = false;
      });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActive, load]);

  function resetPageAnd(apply: () => void) {
    apply();
    setPage(1);
  }

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

  const hasFilters =
    !!keyword || statusFilter !== "all" || kindFilter !== "all";

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="任务"
          description="全站生成任务监控 · 进行中任务自动刷新 · 点详情看完整信息"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索用户 / 模型 / 渠道 / 提示词 / ID"
          filters={
            <>
              <Select
                value={statusFilter}
                onValueChange={(v) => resetPageAnd(() => setStatusFilter(v))}
              >
                <SelectTrigger className="h-10 w-[132px] shrink-0 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="queued">排队</SelectItem>
                  <SelectItem value="running">运行中</SelectItem>
                  <SelectItem value="polling">轮询中</SelectItem>
                  <SelectItem value="succeeded">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                  <SelectItem value="cancelled">已取消</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={kindFilter}
                onValueChange={(v) => resetPageAnd(() => setKindFilter(v))}
              >
                <SelectTrigger className="h-9 w-[110px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="image">图片</SelectItem>
                  <SelectItem value="video">视频</SelectItem>
                  <SelectItem value="llm">LLM</SelectItem>
                  <SelectItem value="audio">音频</SelectItem>
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
          {!loaded ? (
            <AdminListSkeleton cols={7} rows={8} />
          ) : jobs.length === 0 ? (
            <AdminEmptyState
              title={hasFilters ? "没有匹配的任务" : "暂无任务"}
              description={
                hasFilters
                  ? "试试调整状态、类型或搜索词"
                  : "用户提交生成后会出现在这里"
              }
            />
          ) : (
            <Table container={false} className="min-w-[1180px]">
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
                {jobs.map((job) => (
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
                        className="h-9 rounded-xl px-2"
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

      <ListPageFooter>
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </ListPageFooter>

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
