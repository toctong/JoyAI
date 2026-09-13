"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { EnabledBadge } from "@/components/admin/status-badge";
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

type Channel = { id: string; name: string };
type Model = {
  id: string;
  name: string;
  kind: string;
  remoteId: string;
  enabled: boolean;
  isDefault: boolean;
  channelId: string;
  channel?: { name: string };
};

const schema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["image", "video"]),
  remoteId: z.string().min(1),
  isDefault: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      channelId: "",
      name: "",
      kind: "image",
      remoteId: "",
      isDefault: false,
    },
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, c] = await Promise.all([
        api<Model[]>("/admin/models"),
        api<Channel[]>("/admin/channels"),
      ]);
      setModels(m);
      setChannels(c);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (kindFilter !== "all" && m.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.remoteId.toLowerCase().includes(q) ||
        (m.channel?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [models, search, kindFilter]);

  function openCreate() {
    setEditing(null);
    form.reset({
      channelId: channels[0]?.id ?? "",
      name: "",
      kind: "image",
      remoteId: "",
      isDefault: false,
    });
    setOpen(true);
  }

  function openEdit(m: Model) {
    setEditing(m);
    form.reset({
      channelId: m.channelId,
      name: m.name,
      kind: m.kind as "image" | "video",
      remoteId: m.remoteId,
      isDefault: m.isDefault,
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await api(`/admin/models/${editing.id}`, {
          method: "PATCH",
          body: {
            name: values.name,
            remoteId: values.remoteId,
            isDefault: values.isDefault,
          },
        });
        toast.success("模型已更新");
      } else {
        await api("/admin/models", { method: "POST", body: values });
        toast.success("模型已创建");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function toggle(m: Model) {
    try {
      await api(`/admin/models/${m.id}`, {
        method: "PATCH",
        body: { enabled: !m.enabled },
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function remove(m: Model) {
    if (!window.confirm(`确定删除模型「${m.name}」？`)) return;
    try {
      await api(`/admin/models/${m.id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="模型"
          description="图片 / 视频远程模型登记"
          className="mb-0"
        />
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索名称 / remoteId / 渠道"
          filters={
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
              </SelectContent>
            </Select>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
          actions={
            <Button
              size="sm"
              className="h-8"
              onClick={openCreate}
              disabled={channels.length === 0}
            >
              <Plus className="size-3.5" />
              新建模型
            </Button>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {filtered.length === 0 ? (
            <AdminEmptyState
              title={search || kindFilter !== "all" ? "没有匹配的模型" : "暂无模型"}
              description={
                channels.length === 0
                  ? "请先创建渠道，再登记模型"
                  : "登记 Seedream / Seedance 等远程模型 ID"
              }
              action={
                channels.length > 0 && !search ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建模型
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>渠道</TableHead>
                  <TableHead>Remote ID</TableHead>
                  <TableHead>默认</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[88px]">启用</TableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {m.kind === "image" ? "图片" : "视频"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.channel?.name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {m.remoteId}
                    </TableCell>
                    <TableCell>
                      {m.isDefault ? (
                        <Badge>默认</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <EnabledBadge enabled={m.enabled} />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={m.enabled}
                        onCheckedChange={() => void toggle(m)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(m)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => void remove(m)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListPageCard>
      </ListPageMain>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑模型" : "新建模型"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            {!editing ? (
              <>
                <div className="space-y-2">
                  <Label>渠道</Label>
                  <Select
                    value={form.watch("channelId")}
                    onValueChange={(v) => form.setValue("channelId", v)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="选择渠道" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select
                    value={form.watch("kind")}
                    onValueChange={(v) =>
                      form.setValue("kind", v as "image" | "video")
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="image">图片</SelectItem>
                      <SelectItem value="video">视频</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label>显示名称</Label>
              <Input className="h-8" {...form.register("name")} />
            </div>
            <div className="space-y-2">
              <Label>Remote ID</Label>
              <Input
                className="h-8 font-mono text-xs"
                {...form.register("remoteId")}
                placeholder="ep-xxxx / model id"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={!!form.watch("isDefault")}
                onCheckedChange={(v) => form.setValue("isDefault", v)}
              />
              设为该类型默认模型
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button type="submit">{editing ? "保存" : "创建"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
