"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { api, ApiError } from "@/shared/lib/api";
import { useAuthStore } from "@/shared/lib/auth-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  ListPageCard,
  ListPageHeader,
  ListPageMain,
  ListPageShell,
} from "@/components/admin/list-page";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { AdminEmptyState } from "@/components/admin/empty-state";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  | { type: "delete"; user: UserRow }
  | null;

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
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
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

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
      } else if (dialog.type === "delete") {
        await api(`/admin/users/${dialog.user.id}`, { method: "DELETE" });
        toast.success("用户已删除");
      }
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="用户"
          description="管理员可进后台；可选开启腾讯身份验证器（TOTP）"
          className="mb-0"
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
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索用户名 / 角色"
          onRefresh={() => void load()}
          refreshing={refreshing}
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {filtered.length === 0 ? (
            <AdminEmptyState title={search ? "没有匹配用户" : "暂无用户"} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>用户名</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>验证器</TableHead>
                  <TableHead>注册时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
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
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => openRole(u)}
                        >
                          角色
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={() => openPassword(u)}
                        >
                          <KeyRound className="size-3.5" />
                          密码
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          disabled={u.id === me?.id}
                          onClick={() => setDialog({ type: "delete", user: u })}
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

      <Dialog
        open={dialog != null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "create"
                ? "新建用户"
                : dialog?.type === "role"
                  ? `修改角色 · ${dialog.user.username}`
                  : dialog?.type === "password"
                    ? `重置密码 · ${dialog.user.username}`
                    : dialog?.type === "delete"
                      ? `删除用户 · ${dialog.user.username}`
                      : ""}
            </DialogTitle>
          </DialogHeader>

          {dialog?.type === "create" ? (
            <div className="space-y-3 py-1">
              <div className="space-y-2">
                <Label>用户名</Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="至少 3 位"
                />
              </div>
              <div className="space-y-2">
                <Label>密码</Label>
                <Input
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="creator">创作者</SelectItem>
                    <SelectItem value="admin">管理员（可进后台）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {dialog?.type === "role" ? (
            <div className="space-y-2 py-1">
              <Label>角色</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as "admin" | "creator")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="creator">创作者</SelectItem>
                  <SelectItem value="admin">管理员（可进后台）</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {dialog?.type === "password" ? (
            <div className="space-y-2 py-1">
              <Label>新密码</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 6 位"
              />
            </div>
          ) : null}

          {dialog?.type === "delete" ? (
            <p className="py-2 text-sm text-muted-foreground">
              确定删除该用户？其任务与资产将一并清理（外键级联）。最后一个管理员不可删。
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => setDialog(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={saving}
              variant={dialog?.type === "delete" ? "destructive" : "default"}
              onClick={() => void submitDialog()}
            >
              {dialog?.type === "delete" ? "删除" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
