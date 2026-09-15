"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  Trash2,
} from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { CHANNEL_PRESETS, type ProviderPlatformId } from "@joyai/shared";
import { api } from "@/shared/lib/api";
import { buildAdminQuery } from "@/shared/lib/admin-query";
import { useAdminViewMode } from "@/shared/lib/use-admin-view-mode";
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
  ListPageFooter,
  ListPageHeader,
  ListPageMain,
  ListPageShell,
} from "@/components/admin/list-page";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { ListPagination } from "@/components/admin/list-pagination";
import { AdminEmptyState } from "@/components/admin/empty-state";
import { BrandAvatar, BrandLabel } from "@/components/admin/brand-avatar";
import { channelIconSrc } from "@/shared/lib/brand-icons";
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
import { cn } from "@/shared/lib/utils";

type Channel = {
  id: string;
  name: string;
  platform: string;
  baseUrl: string;
  enabled: boolean;
  apiKey?: string;
  modelCount?: number;
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

type TestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  modelCount?: number;
};

const PLATFORM_OPTIONS = Object.entries(CHANNEL_PRESETS) as [
  ProviderPlatformId,
  (typeof CHANNEL_PRESETS)[ProviderPlatformId],
][];

const schema = z.object({
  name: z.string().min(1, "必填"),
  platform: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().url("请输入合法 URL"),
  importCatalog: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [testHints, setTestHints] = useState<Record<string, TestResult>>({});
  const { viewMode, setViewMode } = useAdminViewMode(
    "joyai.admin.channels.view",
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: CHANNEL_PRESETS.volcengine.defaultName,
      platform: "volcengine",
      apiKey: "",
      baseUrl: CHANNEL_PRESETS.volcengine.baseUrl,
      importCatalog: true,
    },
  });

  const load = useCallback(
    async (opts?: { page?: number }) => {
      const nextPage = opts?.page ?? page;
      setRefreshing(true);
      try {
        const res = await api<Paginated<Channel>>(
          `/admin/channels${buildAdminQuery({
            page: nextPage,
            pageSize,
            keyword: keyword.trim() || undefined,
            platform: platformFilter === "all" ? undefined : platformFilter,
            enabled:
              enabledFilter === "all"
                ? undefined
                : enabledFilter === "enabled",
          })}`,
        );
        setChannels(res.items);
        setTotal(res.total);
        setPage(res.page);
        if (res.items.length === 0 && res.total > 0 && res.page > 1) {
          const maxPage = Math.max(1, Math.ceil(res.total / res.pageSize));
          if (maxPage < res.page) {
            setPage(maxPage);
            return;
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "加载渠道失败");
      } finally {
        setRefreshing(false);
      }
    },
    [page, pageSize, keyword, platformFilter, enabledFilter],
  );

  useEffect(() => {
    void load();
  }, [load]);

  function resetPageAnd(apply: () => void) {
    apply();
    setPage(1);
  }

  function applyPlatform(platform: string) {
    const preset = CHANNEL_PRESETS[platform as ProviderPlatformId];
    if (!preset) return;
    form.setValue("platform", platform);
    form.setValue("baseUrl", preset.baseUrl);
    if (!editing) form.setValue("name", preset.defaultName);
  }

  function openCreate() {
    setEditing(null);
    form.reset({
      name: CHANNEL_PRESETS.volcengine.defaultName,
      platform: "volcengine",
      apiKey: "",
      baseUrl: CHANNEL_PRESETS.volcengine.baseUrl,
      importCatalog: true,
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
      importCatalog: false,
    });
    setOpen(true);
  }

  function showTestToast(res: TestResult) {
    const detail = `${res.message}（${res.latencyMs}ms）`;
    if (res.ok) toast.success(detail);
    else toast.error(detail);
  }

  async function testChannel(ch: Channel) {
    setTestingId(ch.id);
    try {
      const res = await api<TestResult>(`/admin/channels/${ch.id}/test`, {
        method: "POST",
        body: {},
      });
      setTestHints((prev) => ({ ...prev, [ch.id]: res }));
      showTestToast(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连通性测试失败");
    } finally {
      setTestingId(null);
    }
  }

  async function probeInDialog() {
    const values = form.getValues();
    if (!values.baseUrl) {
      toast.error("请先填写 Base URL");
      return;
    }
    const apiKey = values.apiKey?.trim();
    if (!editing && !apiKey) {
      toast.error("请先填写 API Key");
      return;
    }
    setProbing(true);
    try {
      let res: TestResult;
      if (editing && !apiKey) {
        res = await api<TestResult>(`/admin/channels/${editing.id}/test`, {
          method: "POST",
          body: { baseUrl: values.baseUrl },
        });
      } else if (editing) {
        res = await api<TestResult>(`/admin/channels/${editing.id}/test`, {
          method: "POST",
          body: { apiKey, baseUrl: values.baseUrl },
        });
      } else {
        res = await api<TestResult>("/admin/channels/probe", {
          method: "POST",
          body: { apiKey, baseUrl: values.baseUrl },
        });
      }
      showTestToast(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "连通性测试失败");
    } finally {
      setProbing(false);
    }
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        const body: Record<string, unknown> = {
          name: values.name,
          baseUrl: values.baseUrl,
        };
        if (values.apiKey?.trim()) body.apiKey = values.apiKey.trim();
        await api(`/admin/channels/${editing.id}`, { method: "PATCH", body });
        toast.success("渠道已更新");
      } else {
        if (!values.apiKey?.trim()) {
          toast.error("请填写 API Key");
          return;
        }
        const res = await api<{
          catalog?: { created: number; updated: number };
        }>("/admin/channels", {
          method: "POST",
          body: {
            name: values.name,
            platform: values.platform,
            apiKey: values.apiKey,
            baseUrl: values.baseUrl,
            importCatalog: values.importCatalog ?? true,
          },
        });
        const c = res.catalog;
        toast.success(
          c
            ? `渠道已创建，导入模型 ${c.created} 新建 / ${c.updated} 更新`
            : "渠道已创建",
        );
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  async function importCatalog(channel: Channel) {
    setImportingId(channel.id);
    try {
      const res = await api<{ created: number; updated: number }>(
        `/admin/channels/${channel.id}/import-catalog`,
        { method: "POST", body: {} },
      );
      toast.success(`已导入：新建 ${res.created} · 更新 ${res.updated}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImportingId(null);
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
    const ok = await confirmDialog({
      title: `删除渠道「${channel.name}」？`,
      description: "关联模型将一并删除，此操作不可恢复。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/channels/${channel.id}`, { method: "DELETE" });
      toast.success("已删除");
      const remaining = total - 1;
      const maxPage = Math.max(1, Math.ceil(remaining / pageSize));
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) setPage(nextPage);
      else await load({ page: nextPage });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  function platformLabel(platform: string) {
    return CHANNEL_PRESETS[platform as ProviderPlatformId]?.label ?? platform;
  }

  function connectivityHint(ch: Channel) {
    const hint = testHints[ch.id];
    if (!hint) {
      return (
        <span className="text-[12px] text-muted-foreground">未测</span>
      );
    }
    return (
      <div
        className={cn(
          "truncate text-[12px]",
          hint.ok
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-destructive",
        )}
        title={`${hint.message} · ${hint.latencyMs}ms`}
      >
        {hint.ok ? "正常" : "失败"} · {hint.latencyMs}ms
      </div>
    );
  }

  function renderActions(ch: Channel) {
    return (
      <div className="inline-flex flex-nowrap items-center justify-end gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          title="测试连通性"
          disabled={testingId === ch.id}
          onClick={() => void testChannel(ch)}
        >
          {testingId === ch.id ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RadioTower className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          title="导入主流模型"
          disabled={importingId === ch.id}
          onClick={() => void importCatalog(ch)}
        >
          {importingId === ch.id ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => openEdit(ch)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-destructive"
          onClick={() => void remove(ch)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    );
  }

  const hasFilters =
    !!keyword || platformFilter !== "all" || enabledFilter !== "all";

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="渠道"
          description="火山 / APIMart / ToAPIs / 百炼 · 支持连通性检测"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索名称 / 平台 / URL"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={
            <>
              <Select
                value={platformFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setPlatformFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[140px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部平台</SelectItem>
                  {PLATFORM_OPTIONS.map(([id, preset]) => (
                    <SelectItem key={id} value={id}>
                      <BrandLabel
                        src={channelIconSrc(id)}
                        label={preset.label}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={enabledFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setEnabledFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[100px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="enabled">启用</SelectItem>
                  <SelectItem value="disabled">停用</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
          actions={
            <Button size="sm" className="h-9 rounded-xl" onClick={openCreate}>
              <Plus className="size-3.5" />
              新建渠道
            </Button>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        {channels.length === 0 ? (
          <ListPageCard>
            <AdminEmptyState
              title={hasFilters ? "没有匹配的渠道" : "暂无渠道"}
              description="创建渠道后可测试连通性，并一键导入主流模型目录"
              action={
                !hasFilters ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建渠道
                  </Button>
                ) : null
              }
            />
          </ListPageCard>
        ) : viewMode === "card" ? (
          <div className="joy-admin-card-grid">
            {channels.map((ch) => (
              <article key={ch.id} className="joy-admin-card-item">
                <div className="joy-admin-card-item-head">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <BrandAvatar
                      src={channelIconSrc(ch.platform)}
                      label={platformLabel(ch.platform)}
                      size={36}
                    />
                    <div className="min-w-0">
                      <h3 className="joy-admin-card-item-title" title={ch.name}>
                        {ch.name}
                      </h3>
                      <p className="joy-admin-card-item-sub" title={ch.baseUrl}>
                        {ch.baseUrl}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0 gap-1.5 whitespace-nowrap pl-1 pr-2">
                    <BrandAvatar
                      src={channelIconSrc(ch.platform)}
                      label={platformLabel(ch.platform)}
                      size={14}
                      rounded="md"
                      className="border-0 bg-transparent p-0"
                    />
                    {platformLabel(ch.platform)}
                  </Badge>
                </div>
                <div className="joy-admin-card-item-meta">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    模型 {ch.modelCount ?? 0}
                  </span>
                  {connectivityHint(ch)}
                </div>
                <div className="joy-admin-card-item-foot">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={ch.enabled}
                      onCheckedChange={() => void toggle(ch)}
                    />
                    {ch.enabled ? "已启用" : "已停用"}
                  </label>
                  {renderActions(ch)}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <ListPageCard className="admin-table">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>平台</TableHead>
                  <TableHead>Base URL</TableHead>
                  <TableHead>模型</TableHead>
                  <TableHead>连通</TableHead>
                  <TableHead className="w-[72px]">启用</TableHead>
                  <TableHead className="admin-col-sticky-right w-[168px] text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BrandAvatar
                          src={channelIconSrc(ch.platform)}
                          label={platformLabel(ch.platform)}
                          size={28}
                        />
                        <span className="truncate font-medium" title={ch.name}>
                          {ch.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <BrandLabel
                        src={channelIconSrc(ch.platform)}
                        label={platformLabel(ch.platform)}
                        size={16}
                        className="text-muted-foreground"
                      />
                    </TableCell>
                    <TableCell className="max-w-[240px]">
                      <div
                        className="truncate font-mono text-xs text-muted-foreground"
                        title={ch.baseUrl}
                      >
                        {ch.baseUrl}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {ch.modelCount ?? 0}
                    </TableCell>
                    <TableCell className="max-w-[160px]">
                      {connectivityHint(ch)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={ch.enabled}
                        onCheckedChange={() => void toggle(ch)}
                      />
                    </TableCell>
                    <TableCell className="admin-col-sticky-right w-[168px] text-right">
                      {renderActions(ch)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑渠道" : "新建渠道"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input className="h-9 rounded-xl" {...form.register("name")} />
            </div>
            {!editing ? (
              <div className="space-y-2">
                <Label>平台</Label>
                <Select
                  value={form.watch("platform")}
                  onValueChange={applyPlatform}
                >
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map(([id, preset]) => (
                      <SelectItem key={id} value={id}>
                        <BrandLabel
                          src={channelIconSrc(id)}
                          label={preset.label}
                        />
                      </SelectItem>
                    ))}
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
                className="h-9 rounded-xl"
                type="password"
                autoComplete="off"
                {...form.register("apiKey")}
              />
            </div>
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                className="h-9 rounded-xl font-mono text-xs"
                {...form.register("baseUrl")}
              />
            </div>
            {!editing ? (
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={!!form.watch("importCatalog")}
                  onCheckedChange={(v) => form.setValue("importCatalog", v)}
                />
                创建后导入主流模型目录
              </label>
            ) : null}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                disabled={probing}
                onClick={() => void probeInDialog()}
              >
                {probing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RadioTower className="size-3.5" />
                )}
                测试连通性
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setOpen(false)}
                >
                  取消
                </Button>
                <Button type="submit" className="rounded-xl">
                  {editing ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
