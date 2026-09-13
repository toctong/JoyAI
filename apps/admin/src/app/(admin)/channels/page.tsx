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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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

type Channel = {
  id: string;
  name: string;
  platform: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
  models?: unknown[];
};

const schema = z.object({
  name: z.string().min(1, "必填"),
  platform: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url("请输入合法 URL"),
});

type FormValues = z.infer<typeof schema>;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      platform: "volcengine",
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    },
  });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setChannels(await api<Channel[]>("/admin/channels"));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.platform.toLowerCase().includes(q) ||
        c.baseUrl.toLowerCase().includes(q),
    );
  }, [channels, search]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      platform: "volcengine",
      apiKey: "",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    });
    setOpen(true);
  }

  function openEdit(ch: Channel) {
    setEditing(ch);
    form.reset({
      name: ch.name,
      platform: ch.platform,
      apiKey: "",
      baseUrl: ch.baseUrl,
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: values.name,
          baseUrl: values.baseUrl,
        };
        if (values.apiKey?.trim()) body.apiKey = values.apiKey.trim();
        await api(`/admin/channels/${editing.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("渠道已更新");
      } else {
        if (!values.apiKey?.trim()) {
          toast.error("请填写 API Key");
          return;
        }
        await api("/admin/channels", {
          method: "POST",
          body: {
            name: values.name,
            platform: values.platform,
            apiKey: values.apiKey,
            baseUrl: values.baseUrl,
          },
        });
        toast.success("渠道已创建");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function toggle(channel: Channel) {
    try {
      await api(`/admin/channels/${channel.id}`, {
        method: "PATCH",
        body: { enabled: !channel.enabled },
      });
      toast.success(channel.enabled ? "已停用" : "已启用");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function remove(channel: Channel) {
    if (!window.confirm(`确定删除渠道「${channel.name}」？关联模型可能受影响。`)) {
      return;
    }
    try {
      await api(`/admin/channels/${channel.id}`, { method: "DELETE" });
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
          title="渠道"
          description="上游供应商凭证 · Base URL"
          className="mb-0"
        />
        <ListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="搜索名称 / 平台 / URL"
          onRefresh={() => void load()}
          refreshing={refreshing}
          actions={
            <Button size="sm" className="h-8" onClick={openCreate}>
              <Plus className="size-3.5" />
              新建渠道
            </Button>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {filtered.length === 0 ? (
            <AdminEmptyState
              title={search ? "没有匹配的渠道" : "暂无渠道"}
              description="先创建火山方舟等上游渠道，再登记模型"
              action={
                !search ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建渠道
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>模型数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[88px]">启用</TableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell className="font-medium">{ch.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ch.platform}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-mono text-xs text-muted-foreground">
                      {ch.baseUrl}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ch.models?.length ?? 0}
                    </TableCell>
                    <TableCell>
                      <EnabledBadge enabled={ch.enabled} />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={ch.enabled}
                        onCheckedChange={() => void toggle(ch)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => openEdit(ch)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive"
                        onClick={() => void remove(ch)}
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
            <DialogTitle>{editing ? "编辑渠道" : "新建渠道"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input className="h-8" {...form.register("name")} />
            </div>
            {!editing ? (
              <div className="space-y-2">
                <Label>平台</Label>
                <Select
                  value={form.watch("platform")}
                  onValueChange={(v) => form.setValue("platform", v)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="volcengine">volcengine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>
                API Key
                {editing ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    （留空则不修改）
                  </span>
                ) : null}
              </Label>
              <Input
                className="h-8"
                type="password"
                autoComplete="off"
                {...form.register("apiKey")}
              />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input className="h-8" {...form.register("baseUrl")} />
            </div>
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
