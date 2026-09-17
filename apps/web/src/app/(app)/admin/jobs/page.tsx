"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dayjs from "dayjs";
import { Eye, Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type JobAsset = {
  id: string;
  url: string;
  kind?: string;
  mimeType?: string | null;
};

type JobInput = {
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

type Job = {
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
  input?: JobInput | null;
  result?: Record<string, unknown> | null;
  assets?: JobAsset[];
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

function DetailRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-3 text-sm sm:grid-cols-[112px_1fr]">
      <div className="text-muted-foreground">{label}</div>
      <div className={mono ? "break-all font-mono text-xs" : "min-w-0 break-words"}>
        {children}
      </div>
    </div>
  );
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

  const input = detail?.input ?? null;
  const assets = detail?.assets ?? [];
  const refUrls = input?.referenceUrls?.filter(Boolean) ?? [];

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

      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              任务详情
              {detailLoading ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
              ) : null}
            </DialogTitle>
          </DialogHeader>

          {detail ? (
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
              <section className="space-y-2.5">
                <DetailRow label="任务 ID" mono>
                  {detail.id}
                </DetailRow>
                <DetailRow label="用户">
                  {detail.user?.username ?? "—"}
                </DetailRow>
                <DetailRow label="类型">
                  <Badge variant="secondary">{kindLabel(detail.kind)}</Badge>
                </DetailRow>
                <DetailRow label="状态">
                  <div className="flex flex-wrap items-center gap-2">
                    <JobStatusBadge status={detail.status} />
                    {typeof detail.progress === "number" &&
                    detail.progress > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        进度 {detail.progress}%
                      </span>
                    ) : null}
                  </div>
                </DetailRow>
                <DetailRow label="用时">
                  {formatDurationMs(detail.durationMs)}
                </DetailRow>
              </section>

              <section className="space-y-2.5 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">渠道 / 模型</div>
                <DetailRow label="渠道">
                  {detail.channelName || "—"}
                  {detail.platform ? (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      ({detail.platform})
                    </span>
                  ) : null}
                </DetailRow>
                <DetailRow label="模型">{detail.modelName || "—"}</DetailRow>
                <DetailRow label="Model ID" mono>
                  {detail.modelId || input?.modelId || "—"}
                </DetailRow>
                <DetailRow label="远端任务" mono>
                  {detail.remoteTaskId || "—"}
                </DetailRow>
              </section>

              <section className="space-y-2.5 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">时间线</div>
                <DetailRow label="创建">{formatTs(detail.createdAt)}</DetailRow>
                <DetailRow label="开始">{formatTs(detail.startedAt)}</DetailRow>
                <DetailRow label="结束">{formatTs(detail.finishedAt)}</DetailRow>
                <DetailRow label="更新">{formatTs(detail.updatedAt)}</DetailRow>
              </section>

              <section className="space-y-2.5 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">生成参数</div>
                <DetailRow label="比例">{input?.ratio || "—"}</DetailRow>
                <DetailRow label="清晰度">
                  {input?.resolution || input?.size || "—"}
                </DetailRow>
                <DetailRow label="时长">
                  {input?.duration != null ? `${input.duration}s` : "—"}
                </DetailRow>
                <DetailRow label="数量">{input?.n ?? "—"}</DetailRow>
                <DetailRow label="参考模式">{input?.refMode || "—"}</DetailRow>
                {(input?.width || input?.height) && (
                  <DetailRow label="尺寸">
                    {input?.width ?? "?"} × {input?.height ?? "?"}
                  </DetailRow>
                )}
              </section>

              <section className="space-y-2 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">提示词</div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-[13px] leading-relaxed">
                  {input?.prompt?.trim() || "—"}
                </pre>
                {input?.negativePrompt ? (
                  <>
                    <div className="pt-1 text-sm font-medium">负向提示词</div>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-3 text-[13px] leading-relaxed text-muted-foreground">
                      {String(input.negativePrompt)}
                    </pre>
                  </>
                ) : null}
              </section>

              {detail.error ? (
                <section className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3.5">
                  <div className="text-sm font-medium text-destructive">
                    错误信息
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-[13px] leading-relaxed text-destructive">
                    {detail.error}
                  </pre>
                </section>
              ) : null}

              {refUrls.length > 0 ? (
                <section className="space-y-2.5 rounded-xl border border-border/80 p-3.5">
                  <div className="text-sm font-medium">
                    参考资源 ({refUrls.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {refUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-border/80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="h-16 w-16 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}

              {assets.length > 0 ? (
                <section className="space-y-2.5 rounded-xl border border-border/80 p-3.5">
                  <div className="text-sm font-medium">
                    产出资产 ({assets.length})
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {assets.map((asset) => {
                      const isVideo =
                        asset.kind === "video" ||
                        /\.(mp4|webm|mov)(\?|$)/i.test(asset.url);
                      return (
                        <a
                          key={asset.id}
                          href={asset.url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-xl border border-border/80 bg-muted/20"
                        >
                          {isVideo ? (
                            <video
                              src={asset.url}
                              className="aspect-video w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.url}
                              alt=""
                              className="aspect-square w-full object-cover"
                            />
                          )}
                          <div className="truncate px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                            {asset.id}
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {detail.result && Object.keys(detail.result).length > 0 ? (
                <section className="space-y-2 rounded-xl border border-border/80 p-3.5">
                  <div className="text-sm font-medium">Result</div>
                  <pre className="max-h-40 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(detail.result, null, 2)}
                  </pre>
                </section>
              ) : null}

              {input ? (
                <section className="space-y-2 rounded-xl border border-border/80 p-3.5">
                  <div className="text-sm font-medium">完整 Input</div>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(input, null, 2)}
                  </pre>
                </section>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
