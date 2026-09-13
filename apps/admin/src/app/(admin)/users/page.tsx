"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { api } from "@/shared/lib/api";
import { Badge } from "@/components/ui/badge";
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

type User = {
  id: string;
  username: string;
  role: string;
  createdAt: string;
  _count?: { jobs?: number; assets?: number };
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setUsers(await api<User[]>("/admin/users"));
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

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="用户"
          description="账号与角色（写操作接口后续补齐）"
          className="mb-0"
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
                  <TableHead>注册时间</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                      >
                        {u.role === "admin" ? "管理员" : "创作者"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {dayjs(u.createdAt).format("YYYY-MM-DD HH:mm")}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">
                      {u.id}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListPageCard>
      </ListPageMain>
    </ListPageShell>
  );
}
