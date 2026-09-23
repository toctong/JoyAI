"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore } from "@/shared/lib/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UserRow = {
  id: string;
  username: string;
  role: "admin" | "creator";
  totpEnabled: boolean;
  createdAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "role"; user: UserRow }
  | { type: "password"; user: UserRow }
  | null;

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "creator">("creator");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setUsers(await api<UserRow[]>("/admin/users"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载用户失败");
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    });
  }, [users, keyword, roleFilter]);

  const total = filtered.length;
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [total, pageSize, page]);

  function resetPageAnd(apply: () => void) {
    apply();
    setPage(1);
  }

  function openCreate() {
    setUsername("");
    setPassword("");
    setRole("creator");
    setDialog({ type: "create" });
  }

  function openRole(user: UserRow) {
    setRole(user.role);
    setDialog({ type: "role", user });
  }

  function openPassword(user: UserRow) {
    setPassword("");
    setDialog({ type: "password", user });
  }

  async function removeUser(user: UserRow) {
    const ok = await confirmDialog({
      title: `删除用户「${user.username}」？`,
      description:
        "其任务与资产将一并清理（外键级联）。最后一个管理员不可删。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/users/${user.id}`, { method: "DELETE" });
      toast.success("用户已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  async function submitDialog() {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.type === "create") {
        if (username.trim().length < 3) {
          toast.error("用户名至少 3 位");
          return;
        }
        if (password.length < 6) {
          toast.error("密码至少 6 位");
          return;
        }
        await api("/admin/users", {
          method: "POST",
          body: {
            username: username.trim(),
            password,
            role,
          },
        });
        toast.success("用户已创建");
      } else if (dialog.type === "role") {
        await api(`/admin/users/${dialog.user.id}`, {
          method: "PATCH",
          body: { role },
        });
        toast.success("角色已更新");
      } else if (dialog.type === "password") {
        if (password.length < 6) {
          toast.error("密码至少 6 位");
          return;
        }
        await api(`/admin/users/${dialog.user.id}`, {
          method: "PATCH",
          body: { password },
        });
        toast.success("密码已重置");
      }
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  const hasFilters = !!keyword || roleFilter !== "all";
  const dialogTitle =
    dialog?.type === "create"
      ? "新建用户"
      : dialog?.type === "role"
        ? `修改角色 · ${dialog.user.username}`
        : dialog?.type === "password"
          ? `重置密码 · ${dialog.user.username}`
          : "";

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="用户"
          description="管理员可进后台；可选开启腾讯身份验证器（TOTP）"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索用户名 / 角色"
          filters={
            <Select
              value={roleFilter}
              onValueChange={(v) => resetPageAnd(() => setRoleFilter(v))}
            >
              <SelectTrigger className="h-9 w-[120px] rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部角色</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="creator">创作者</SelectItem>
              </SelectContent>
            </Select>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
          actions={
            <Button
              size="sm"
              className="h-9 rounded-xl"
              onClick={openCreate}
            >
              <Plus className="size-3.5" />
              新建用户
            </Button>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {!loaded ? (
            <AdminListSkeleton cols={5} rows={6} />
          ) : pageItems.length === 0 ? (
            <AdminEmptyState
              title={hasFilters ? "没有匹配的用户" : "暂无用户"}
              description={
                hasFilters
                  ? "试试调整搜索或角色筛选"
                  : "创建第一个管理员或创作者账号"
              }
              action={
                !hasFilters ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建用户
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>验证器</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="admin-col-sticky-right text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.username}
                      {u.id === me?.id ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          （我）
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                      >
                        {u.role === "admin" ? "管理员" : "创作者"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.totpEnabled ? (
                        <Badge variant="outline">已开启</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          未开启
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dayjs(u.createdAt).format("YYYY-MM-DD HH:mm")}
                    </TableCell>
                    <TableCell className="admin-col-sticky-right text-right">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => openRole(u)}
                        >
                          角色
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg"
                          onClick={() => openPassword(u)}
                        >
                          <KeyRound className="size-3.5" />
                          密码
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          disabled={u.id === me?.id}
                          onClick={() => void removeUser(u)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
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

      <AdminDrawer
        open={dialog != null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialogTitle}
        widthClassName="sm:max-w-[420px]"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-[2px]"
              disabled={saving}
              onClick={() => setDialog(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              className="h-8 rounded-[2px]"
              disabled={saving}
              onClick={() => void submitDialog()}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {dialog?.type === "create" ? (
            <>
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input
                  className="h-8 rounded-[2px]"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="至少 3 位"
                />
              </div>
              <div className="space-y-2">
                <Label>密码</Label>
                <Input
                  className="h-8 rounded-[2px]"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                />
              </div>
              <div className="space-y-2">
                <Label>角色</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as "admin" | "creator")}
                >
                  <SelectTrigger className="h-8 rounded-[2px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="shadow-none">
                    <SelectItem value="creator">创作者</SelectItem>
                    <SelectItem value="admin">管理员（可进后台）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          {dialog?.type === "role" ? (
            <div className="space-y-2">
              <Label>角色</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "admin" | "creator")}
              >
                <SelectTrigger className="h-8 rounded-[2px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="shadow-none">
                  <SelectItem value="creator">创作者</SelectItem>
                  <SelectItem value="admin">管理员（可进后台）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {dialog?.type === "password" ? (
            <div className="space-y-2">
              <Label>新密码</Label>
              <Input
                className="h-8 rounded-[2px]"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          ) : null}
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
