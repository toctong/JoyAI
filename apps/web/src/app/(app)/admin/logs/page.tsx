"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { buildAdminQuery } from "@/shared/lib/admin-query";
import { cn } from "@/shared/lib/utils";
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
import { AdminDrawer } from "@/components/admin/admin-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SystemLogLevel = "error" | "warn" | "info" | "debug";

type SystemLogItem = {
  id: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  stack: string | null;
  userId: string | null;
  createdAt: string;
};

type Paginated = {
  items: SystemLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

const LEVEL_OPTIONS = [
  { value: "all", label: "全部级别" },
  { value: "error", label: "Error" },
  { value: "warn", label: "Warn" },
  { value: "info", label: "Info" },
] as const;

function LevelBadge({ level }: { level: SystemLogLevel }) {
  const styles: Record<SystemLogLevel, string> = {
    error:
      "border-transparent bg-destructive/15 text-destructive hover:bg-destructive/15",
    warn: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15",
    info: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-400 hover:bg-sky-500/15",
    debug: "border-transparent bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("rounded-xl font-mono uppercase", styles[level])}>
      {level}
    </Badge>
  );
}

export default function AdminLogsPage() {
  const [items, setItems] = useState<SystemLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sources, setSources] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<SystemLogItem | null>(null);

  const loadSources = useCallback(async () => {
    try {
      const list = await api<string[]>("/admin/system-logs/sources");
      setSources(Array.isArray(list) ? list : []);
    } catch {
      setSources([]);
    }
  }, []);

  const load = useCallback(
    async (opts?: { page?: number }) => {
      const nextPage = opts?.page ?? page;
      setRefreshing(true);
      try {
        const res = await api<Paginated>(
          `/admin/system-logs${buildAdminQuery({
            page: nextPage,
            pageSize,
            keyword: keyword.trim() || undefined,
            level: levelFilter === "all" ? undefined : levelFilter,
            source: sourceFilter === "all" ? undefined : sourceFilter,
          })}`,
        );
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
        setPage(res.page ?? nextPage);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载日志失败");
      } finally {
        setRefreshing(false);
        setLoaded(true);
      }
    },
    [page, pageSize, keyword, levelFilter, sourceFilter],
  );

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="日志"
          description="系统运行日志（Error / Warn / Info）。记录异常、任务失败与关键管理变更，不记录普通登录。"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          searchPlaceholder="搜索消息 / 来源 / 上下文…"
          filters={
            <>
              <Select
                value={levelFilter}
                onValueChange={(v) => {
                  setLevelFilter(v ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[120px] rounded-xl">
                  <SelectValue placeholder="级别" />
                </SelectTrigger>
                <SelectContent className="shadow-none">
                  {LEVEL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={sourceFilter}
                onValueChange={(v) => {
                  setSourceFilter(v ?? "all");
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[140px] rounded-xl">
                  <SelectValue placeholder="来源" />
                </SelectTrigger>
                <SelectContent className="shadow-none">
                  <SelectItem value="all">全部来源</SelectItem>
                  {sources.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => {
            void loadSources();
            void load();
          }}
          refreshing={refreshing}
        />
      </ListPageHeader>

      <ListPageMain>
        {!loaded ? (
          <AdminListSkeleton rows={8} cols={5} />
        ) : items.length === 0 ? (
          <ListPageCard>
            <AdminEmptyState
              title="暂无系统日志"
              description="出现接口异常、生成任务失败或关键管理操作时会写入此处"
            />
          </ListPageCard>
        ) : (
          <ListPageCard scroll className="admin-table">
            <Table container={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">时间</TableHead>
                  <TableHead className="w-[88px]">级别</TableHead>
                  <TableHead className="w-[100px]">来源</TableHead>
                  <TableHead>消息</TableHead>
                  <TableHead className="w-[72px] text-right">查看</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">
                      {dayjs(row.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <LevelBadge level={row.level} />
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="rounded-xl font-mono font-normal"
                      >
                        {row.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[420px] truncate text-[13px]">
                      {row.message}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-xl"
                        onClick={() => setDetail(row)}
                        aria-label="查看详情"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListPageCard>
        )}
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

      <AdminDrawer
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title="日志详情"
        description={detail ? `${detail.level.toUpperCase()} · ${detail.source}` : undefined}
        widthClassName="sm:max-w-[640px]"
        footer={
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => setDetail(null)}
          >
            关闭
          </Button>
        }
      >
        {detail ? (
          <div className="space-y-3 text-[13px]">
            <div className="grid grid-cols-[72px_1fr] gap-y-2">
              <span className="text-muted-foreground">时间</span>
              <span className="font-mono text-[12px]">
                {dayjs(detail.createdAt).format("YYYY-MM-DD HH:mm:ss")}
              </span>
              <span className="text-muted-foreground">级别</span>
              <span>
                <LevelBadge level={detail.level} />
              </span>
              <span className="text-muted-foreground">来源</span>
              <span className="font-mono">{detail.source}</span>
              <span className="text-muted-foreground">用户</span>
              <span className="font-mono text-[12px]">
                {detail.userId ?? "—"}
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="text-muted-foreground">消息</div>
              <p className="rounded-xl border border-border bg-muted/40 p-3 leading-relaxed">
                {detail.message}
              </p>
            </div>
            {detail.context ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground">上下文</div>
                <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">
                  {JSON.stringify(detail.context, null, 2)}
                </pre>
              </div>
            ) : null}
            {detail.stack ? (
              <div className="space-y-1.5">
                <div className="text-muted-foreground">堆栈</div>
                <pre className="max-h-[280px] overflow-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {detail.stack}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </AdminDrawer>
    </ListPageShell>
  );
}
