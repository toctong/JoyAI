"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { Eye } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api } from "@/shared/lib/api";
import { buildAdminQuery } from "@/shared/lib/admin-query";
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

type AuditItem = {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

type Paginated = {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTION_OPTIONS = [
  { value: "all", label: "全部动作" },
  { value: "auth.login", label: "登录" },
  { value: "auth.login_failed", label: "登录失败" },
  { value: "auth.password_changed", label: "修改密码" },
  { value: "auth.totp_enabled", label: "开启 TOTP" },
  { value: "auth.totp_disabled", label: "关闭 TOTP" },
  { value: "admin.user_create", label: "创建用户" },
  { value: "admin.user_role", label: "改角色" },
  { value: "admin.user_password_reset", label: "重置密码" },
  { value: "admin.user_delete", label: "删除用户" },
  { value: "admin.setting_set", label: "改系统设置" },
] as const;

function actionLabel(action: string) {
  return ACTION_OPTIONS.find((o) => o.value === action)?.label ?? action;
}

export default function AdminLogsPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<AuditItem | null>(null);

  const load = useCallback(
    async (opts?: { page?: number }) => {
      const nextPage = opts?.page ?? page;
      setRefreshing(true);
      try {
        const res = await api<Paginated>(
          `/admin/audit-logs${buildAdminQuery({
            page: nextPage,
            pageSize,
            keyword: keyword.trim() || undefined,
            action: actionFilter === "all" ? undefined : actionFilter,
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
    [page, pageSize, keyword, actionFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="日志"
          description="登录、安全与管理操作审计，便于追溯谁在何时做了什么。"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          searchPlaceholder="搜索动作 / 用户 / 详情…"
          filters={
            <Select
              value={actionFilter}
              onValueChange={(v) => {
                setActionFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 w-[140px] rounded-xl">
                <SelectValue placeholder="动作" />
              </SelectTrigger>
              <SelectContent className="shadow-none">
                {ACTION_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
        />
      </ListPageHeader>

      <ListPageMain>
        {!loaded ? (
          <AdminListSkeleton rows={8} cols={5} />
        ) : items.length === 0 ? (
          <ListPageCard>
            <AdminEmptyState
              title="暂无审计日志"
              description="登录、改密、用户管理与系统设置变更会写入此处"
            />
          </ListPageCard>
        ) : (
          <ListPageCard scroll className="admin-table">
            <Table container={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">时间</TableHead>
                  <TableHead className="w-[120px]">用户</TableHead>
                  <TableHead className="w-[160px]">动作</TableHead>
                  <TableHead>详情</TableHead>
                  <TableHead className="w-[72px] text-right">查看</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-[12px] text-muted-foreground">
                      {dayjs(row.createdAt).format("YYYY-MM-DD HH:mm:ss")}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      {row.username ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className="rounded-xl font-normal"
                      >
                        {actionLabel(row.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[360px] truncate font-mono text-[11px] text-muted-foreground">
                      {row.detail ? JSON.stringify(row.detail) : "—"}
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
        description={detail ? actionLabel(detail.action) : undefined}
        widthClassName="sm:max-w-[560px]"
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
              <span className="text-muted-foreground">用户</span>
              <span>{detail.username ?? detail.userId ?? "—"}</span>
              <span className="text-muted-foreground">动作</span>
              <span>{detail.action}</span>
            </div>
            <div className="space-y-1.5">
              <div className="text-muted-foreground">详情 JSON</div>
              <pre className="overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed">
                {detail.detail
                  ? JSON.stringify(detail.detail, null, 2)
                  : "null"}
              </pre>
            </div>
          </div>
        ) : null}
      </AdminDrawer>
    </ListPageShell>
  );
}
