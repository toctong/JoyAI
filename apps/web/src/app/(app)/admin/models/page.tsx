"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import type { ModelCapabilities, ModelPricing } from "@joyai/shared";
import { api } from "@/shared/lib/api";
import { buildAdminQuery } from "@/shared/lib/admin-query";
import { useAdminViewMode } from "@/shared/lib/use-admin-view-mode";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  ListPageFooter,
  ListPageHeader,
  ListPageMain,
  ListPageShell,
} from "@/components/admin/list-page";
import { ListToolbar } from "@/components/admin/list-toolbar";
import { ListPagination } from "@/components/admin/list-pagination";
import { AdminEmptyState } from "@/components/admin/empty-state";
import {
  CapabilityBadges,
  PriceSummary,
  kindLabel,
} from "@/components/admin/model-meta";
import { BrandAvatar, BrandLabel } from "@/components/admin/brand-avatar";
import { channelIconSrc, modelIconSrc } from "@/shared/lib/brand-icons";
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

type Channel = { id: string; name: string; platform?: string };
type Model = {
  id: string;
  name: string;
  kind: string;
  remoteId: string;
  description?: string | null;
  pricing?: ModelPricing | null;
  capabilities?: ModelCapabilities | null;
  enabled: boolean;
  channelId: string;
  channel?: { name: string; platform?: string };
};

type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

const schema = z.object({
  channelId: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(["image", "video", "llm"]),
  remoteId: z.string().min(1),
  description: z.string().optional(),
  billing: z.enum(["token", "per_image", "per_second", "per_video", "tiered"]),
  inputPer1M: z.string().optional(),
  outputPer1M: z.string().optional(),
  perImage: z.string().optional(),
  perSecond: z.string().optional(),
  perVideo: z.string().optional(),
  priceNote: z.string().optional(),
  inputMods: z.string().optional(),
  outputMods: z.string().optional(),
  features: z.string().optional(),
  maxRefImages: z.string().optional(),
  maxRefVideos: z.string().optional(),
  maxRefAudios: z.string().optional(),
  maxDurationSec: z.string().optional(),
  resolutions: z.string().optional(),
  ratios: z.string().optional(),
  sizes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function numOrUndef(s?: string) {
  if (s == null || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function buildPricing(values: FormValues): ModelPricing {
  return {
    currency: "CNY",
    billing: values.billing,
    inputPer1M: numOrUndef(values.inputPer1M),
    outputPer1M: numOrUndef(values.outputPer1M),
    perImage: numOrUndef(values.perImage),
    perSecond: numOrUndef(values.perSecond),
    perVideo: numOrUndef(values.perVideo),
    note: values.priceNote?.trim() || undefined,
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

function parseList(s?: string) {
  return (s ?? "")
    .split(/[,/，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function buildCapabilities(values: FormValues): ModelCapabilities {
  const parseMods = (s?: string) =>
    parseList(s) as ModelCapabilities["input"];

  const input = parseMods(values.inputMods);
  const output = parseMods(values.outputMods);
  const features = parseList(values.features);
  const resolutions = parseList(values.resolutions);
  const ratios = parseList(values.ratios);
  const sizes = parseList(values.sizes);

  return {
    input: input.length ? input : ["text"],
    output: output.length
      ? output
      : values.kind === "llm"
        ? ["text"]
        : values.kind === "image"
          ? ["image"]
          : ["video"],
    features: features.length ? features : undefined,
    maxRefImages: numOrUndef(values.maxRefImages),
    maxRefVideos: numOrUndef(values.maxRefVideos),
    maxRefAudios: numOrUndef(values.maxRefAudios),
    maxDurationSec: numOrUndef(values.maxDurationSec),
    resolutions: resolutions.length ? resolutions : undefined,
    ratios: ratios.length ? ratios : undefined,
    sizes: sizes.length ? sizes : undefined,
  };
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Model | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { viewMode, setViewMode } = useAdminViewMode("joyai.admin.models.view");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      channelId: "",
      name: "",
      kind: "image",
      remoteId: "",
      description: "",
      billing: "per_image",
      inputMods: "text",
      outputMods: "image",
      maxRefImages: "",
      maxRefVideos: "",
      maxRefAudios: "",
      maxDurationSec: "",
      resolutions: "",
      ratios: "",
      sizes: "",
    },
  });

  const billing = form.watch("billing");

  const loadChannels = useCallback(async () => {
    try {
      const res = await api<Paginated<Channel>>(
        `/admin/channels${buildAdminQuery({ page: 1, pageSize: 100 })}`,
      );
      setChannels(res.items);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载渠道失败");
    }
  }, []);

  const loadModels = useCallback(
    async (opts?: { page?: number }) => {
      const nextPage = opts?.page ?? page;
      setRefreshing(true);
      try {
        const res = await api<Paginated<Model>>(
          `/admin/models${buildAdminQuery({
            page: nextPage,
            pageSize,
            keyword: keyword.trim() || undefined,
            kind: kindFilter === "all" ? undefined : kindFilter,
            enabled:
              enabledFilter === "all"
                ? undefined
                : enabledFilter === "enabled",
            channelId: channelFilter === "all" ? undefined : channelFilter,
          })}`,
        );
        setModels(res.items);
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
        toast.error(e instanceof Error ? e.message : "加载模型失败");
      } finally {
        setRefreshing(false);
      }
    },
    [
      page,
      pageSize,
      keyword,
      kindFilter,
      enabledFilter,
      channelFilter,
    ],
  );

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  useEffect(() => {
    setSelectedIds([]);
  }, [keyword, kindFilter, enabledFilter, channelFilter]);

  function resetPageAnd(apply: () => void) {
    apply();
    setPage(1);
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((prev) =>
      checked
        ? prev.includes(id)
          ? prev
          : [...prev, id]
        : prev.filter((x) => x !== id),
    );
  }

  function toggleSelectAllPage(checked: boolean) {
    const pageIds = models.map((m) => m.id);
    setSelectedIds((prev) => {
      if (checked) {
        return [...new Set([...prev, ...pageIds])];
      }
      const drop = new Set(pageIds);
      return prev.filter((id) => !drop.has(id));
    });
  }

  const pageSelectedCount = models.filter((m) =>
    selectedIds.includes(m.id),
  ).length;
  const allPageSelected =
    models.length > 0 && pageSelectedCount === models.length;
  const somePageSelected =
    pageSelectedCount > 0 && pageSelectedCount < models.length;

  function openCreate() {
    setEditing(null);
    form.reset({
      channelId: channels[0]?.id ?? "",
      name: "",
      kind: "image",
      remoteId: "",
      description: "",
      billing: "per_image",
      inputPer1M: "",
      outputPer1M: "",
      perImage: "",
      perSecond: "",
      perVideo: "",
      priceNote: "",
      inputMods: "text",
      outputMods: "image",
      features: "t2i",
      maxRefImages: "",
      maxRefVideos: "",
      maxRefAudios: "",
      maxDurationSec: "",
      resolutions: "",
      ratios: "",
      sizes: "",
    });
    setOpen(true);
  }

  function openEdit(m: Model) {
    setEditing(m);
    const p = m.pricing;
    const c = m.capabilities;
    form.reset({
      channelId: m.channelId,
      name: m.name,
      kind: m.kind as "image" | "video" | "llm",
      remoteId: m.remoteId,
      description: m.description ?? "",
      billing: p?.billing ?? "per_image",
      inputPer1M: p?.inputPer1M != null ? String(p.inputPer1M) : "",
      outputPer1M: p?.outputPer1M != null ? String(p.outputPer1M) : "",
      perImage: p?.perImage != null ? String(p.perImage) : "",
      perSecond: p?.perSecond != null ? String(p.perSecond) : "",
      perVideo: p?.perVideo != null ? String(p.perVideo) : "",
      priceNote: p?.note ?? "",
      inputMods: (c?.input ?? ["text"]).join(","),
      outputMods: (c?.output ?? []).join(","),
      features: (c?.features ?? []).join(","),
      maxRefImages: c?.maxRefImages != null ? String(c.maxRefImages) : "",
      maxRefVideos: c?.maxRefVideos != null ? String(c.maxRefVideos) : "",
      maxRefAudios: c?.maxRefAudios != null ? String(c.maxRefAudios) : "",
      maxDurationSec:
        c?.maxDurationSec != null ? String(c.maxDurationSec) : "",
      resolutions: (c?.resolutions ?? []).join(","),
      ratios: (c?.ratios ?? []).join(","),
      sizes: (c?.sizes ?? []).join(","),
    });
    setOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      const pricing = buildPricing(values);
      const capabilities = buildCapabilities(values);
      if (editing) {
        await api(`/admin/models/${editing.id}`, {
          method: "PATCH",
          body: {
            name: values.name,
            remoteId: values.remoteId,
            description: values.description,
            pricing,
            capabilities,
          },
        });
        toast.success("模型已更新");
      } else {
        await api("/admin/models", {
          method: "POST",
          body: {
            channelId: values.channelId,
            name: values.name,
            kind: values.kind,
            remoteId: values.remoteId,
            description: values.description,
            pricing,
            capabilities,
          },
        });
        toast.success("模型已创建");
      }
      setOpen(false);
      await loadModels();
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
      await loadModels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    }
  }

  async function remove(m: Model) {
    const ok = await confirmDialog({
      title: `删除模型「${m.name}」？`,
      description: "删除后不可恢复。",
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/models/${m.id}`, { method: "DELETE" });
      toast.success("已删除");
      setSelectedIds((prev) => prev.filter((id) => id !== m.id));
      const remaining = total - 1;
      const maxPage = Math.max(1, Math.ceil(remaining / pageSize));
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) setPage(nextPage);
      else await loadModels({ page: nextPage });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return;
    const ok = await confirmDialog({
      title: `批量删除 ${selectedIds.length} 个模型？`,
      description: "删除后不可恢复。",
      confirmText: "全部删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await api<{ deleted: number }>("/admin/models/batch-delete", {
        method: "POST",
        body: { ids: selectedIds },
      });
      toast.success(`已删除 ${res.deleted} 个模型`);
      setSelectedIds([]);
      const remaining = Math.max(0, total - res.deleted);
      const maxPage = Math.max(1, Math.ceil(remaining / pageSize) || 1);
      const nextPage = Math.min(page, maxPage);
      if (nextPage !== page) setPage(nextPage);
      else await loadModels({ page: nextPage });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量删除失败");
    }
  }

  const hasFilters =
    !!keyword ||
    kindFilter !== "all" ||
    enabledFilter !== "all" ||
    channelFilter !== "all";

  function renderActions(m: Model) {
    return (
      <div className="inline-flex items-center gap-0.5">
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
      </div>
    );
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="模型"
          description="图片 / 视频 / LLM · 人民币计价与多模态能力"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索名称 / remoteId / 渠道"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          filters={
            <>
              <Select
                value={kindFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setKindFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[110px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="image">图片</SelectItem>
                  <SelectItem value="video">视频</SelectItem>
                  <SelectItem value="llm">LLM</SelectItem>
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
              <Select
                value={channelFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setChannelFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[140px] rounded-xl">
                  <SelectValue placeholder="渠道" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部渠道</SelectItem>
                  {channels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <BrandLabel
                        src={c.platform ? channelIconSrc(c.platform) : null}
                        label={c.name}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => void loadModels()}
          refreshing={refreshing}
          actions={
            <>
              {selectedIds.length > 0 ? (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-9 rounded-xl"
                  onClick={() => void removeSelected()}
                >
                  <Trash2 className="size-3.5" />
                  删除所选 ({selectedIds.length})
                </Button>
              ) : null}
              <Button
                size="sm"
                className="h-9 rounded-xl"
                onClick={openCreate}
                disabled={channels.length === 0}
              >
                <Plus className="size-3.5" />
                新建模型
              </Button>
            </>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        {models.length === 0 ? (
          <ListPageCard>
            <AdminEmptyState
              title={hasFilters ? "没有匹配的模型" : "暂无模型"}
              description={
                channels.length === 0
                  ? "请先创建渠道，再导入或登记模型"
                  : "可在渠道页一键导入主流模型，或在此手动登记"
              }
              action={
                channels.length > 0 && !hasFilters ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建模型
                  </Button>
                ) : null
              }
            />
          </ListPageCard>
        ) : viewMode === "card" ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-0.5">
              <Checkbox
                checked={
                  allPageSelected
                    ? true
                    : somePageSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                aria-label="全选本页"
              />
              <span className="text-xs text-muted-foreground">
                {pageSelectedCount > 0
                  ? `本页已选 ${pageSelectedCount} / ${models.length}`
                  : "全选本页"}
              </span>
            </div>
            <div className="joy-admin-card-grid">
            {models.map((m) => (
              <article key={m.id} className="joy-admin-card-item">
                <div className="joy-admin-card-item-head">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Checkbox
                      checked={selectedIds.includes(m.id)}
                      onCheckedChange={(v) =>
                        toggleSelected(m.id, v === true)
                      }
                      aria-label={`选择 ${m.name}`}
                      className="mt-1"
                    />
                    <BrandAvatar
                      src={modelIconSrc({
                        remoteId: m.remoteId,
                        name: m.name,
                        kind: m.kind,
                      })}
                      label={m.name}
                      size={36}
                    />
                    <div className="min-w-0">
                      <h3 className="joy-admin-card-item-title" title={m.name}>
                        {m.name}
                      </h3>
                      <p className="joy-admin-card-item-sub" title={m.remoteId}>
                        {m.remoteId}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">{kindLabel(m.kind)}</Badge>
                </div>
                <div className="joy-admin-card-item-meta">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                    {m.channel?.platform ? (
                      <BrandAvatar
                        src={channelIconSrc(m.channel.platform)}
                        label={m.channel.name ?? m.channel.platform}
                        size={16}
                        rounded="md"
                      />
                    ) : null}
                    <span className="truncate">{m.channel?.name ?? "—"}</span>
                  </span>
                </div>
                <PriceSummary pricing={m.pricing} />
                <CapabilityBadges capabilities={m.capabilities} />
                <div className="joy-admin-card-item-foot">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={() => void toggle(m)}
                    />
                    {m.enabled ? "已启用" : "已停用"}
                  </label>
                  {renderActions(m)}
                </div>
              </article>
            ))}
            </div>
          </div>
        ) : (
          <ListPageCard className="admin-table">
            <Table className="min-w-[1280px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        allPageSelected
                          ? true
                          : somePageSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                      aria-label="全选本页"
                    />
                  </TableHead>
                  <TableHead className="min-w-[200px]">模型</TableHead>
                  <TableHead className="w-[72px] whitespace-nowrap">
                    类型
                  </TableHead>
                  <TableHead className="min-w-[140px] whitespace-nowrap">
                    渠道
                  </TableHead>
                  <TableHead className="min-w-[160px] whitespace-nowrap">
                    价格（全档）
                  </TableHead>
                  <TableHead className="min-w-[240px] whitespace-nowrap">
                    能力 / 限制
                  </TableHead>
                  <TableHead className="w-[72px] whitespace-nowrap">
                    启用
                  </TableHead>
                  <TableHead className="admin-col-sticky-right w-[96px] text-right">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => (
                  <TableRow key={m.id} data-state={selectedIds.includes(m.id) ? "selected" : undefined}>
                    <TableCell className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.includes(m.id)}
                        onCheckedChange={(v) =>
                          toggleSelected(m.id, v === true)
                        }
                        aria-label={`选择 ${m.name}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-[200px] max-w-[280px]">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BrandAvatar
                          src={modelIconSrc({
                            remoteId: m.remoteId,
                            name: m.name,
                            kind: m.kind,
                          })}
                          label={m.name}
                          size={28}
                        />
                        <div className="min-w-0">
                          <div
                            className="truncate font-medium"
                            title={m.name}
                          >
                            {m.name}
                          </div>
                          <div
                            className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground"
                            title={m.remoteId}
                          >
                            {m.remoteId}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="secondary">{kindLabel(m.kind)}</Badge>
                    </TableCell>
                    <TableCell className="min-w-[140px] max-w-[180px]">
                      <div
                        className="flex min-w-0 items-center gap-1.5"
                        title={m.channel?.name}
                      >
                        {m.channel?.platform ? (
                          <BrandAvatar
                            src={channelIconSrc(m.channel.platform)}
                            label={m.channel.name ?? m.channel.platform}
                            size={18}
                            rounded="md"
                          />
                        ) : null}
                        <span className="truncate text-muted-foreground">
                          {m.channel?.name ?? "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <PriceSummary pricing={m.pricing} compact />
                    </TableCell>
                    <TableCell>
                      <CapabilityBadges
                        capabilities={m.capabilities}
                        compact
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Switch
                        checked={m.enabled}
                        onCheckedChange={() => void toggle(m)}
                      />
                    </TableCell>
                    <TableCell className="admin-col-sticky-right text-right">
                      {renderActions(m)}
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
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-border/70 px-6 py-4">
            <DialogTitle>{editing ? "编辑模型" : "新建模型"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {!editing ? (
                <>
                  <div className="space-y-2">
                    <Label>渠道</Label>
                    <Select
                      value={form.watch("channelId")}
                      onValueChange={(v) => form.setValue("channelId", v)}
                    >
                      <SelectTrigger className="h-9 rounded-xl">
                        <SelectValue placeholder="选择渠道" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            <BrandLabel
                              src={
                                c.platform ? channelIconSrc(c.platform) : null
                              }
                              label={c.name}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select
                      value={form.watch("kind")}
                      onValueChange={(v) => {
                        const kind = v as "image" | "video" | "llm";
                        form.setValue("kind", kind);
                        if (kind === "llm") {
                          form.setValue("billing", "token");
                          form.setValue("outputMods", "text");
                        } else if (kind === "image") {
                          form.setValue("billing", "per_image");
                          form.setValue("outputMods", "image");
                        } else {
                          form.setValue("billing", "per_second");
                          form.setValue("outputMods", "video");
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">图片</SelectItem>
                        <SelectItem value="video">视频</SelectItem>
                        <SelectItem value="llm">LLM（仅目录）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input className="h-9 rounded-xl" {...form.register("name")} />
              </div>
              <div className="space-y-2">
                <Label>Remote ID</Label>
                <Input
                  className="h-9 rounded-xl font-mono text-xs"
                  {...form.register("remoteId")}
                  placeholder="模型 ID / endpoint"
                />
              </div>
              <div className="space-y-2">
                <Label>说明</Label>
                <Input
                  className="h-9 rounded-xl"
                  {...form.register("description")}
                />
              </div>

              <div className="space-y-3 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">人民币计价</div>
                <div className="space-y-2">
                  <Label>计费方式</Label>
                  <Select
                    value={billing}
                    onValueChange={(v) =>
                      form.setValue("billing", v as FormValues["billing"])
                    }
                  >
                    <SelectTrigger className="h-9 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="token">Token（¥/百万）</SelectItem>
                      <SelectItem value="per_image">按张</SelectItem>
                      <SelectItem value="per_second">按秒</SelectItem>
                      <SelectItem value="per_video">按条</SelectItem>
                      <SelectItem value="tiered">分档</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {billing === "token" || billing === "tiered" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>输入 ¥/1M</Label>
                      <Input
                        className="h-9 rounded-xl"
                        {...form.register("inputPer1M")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>输出 ¥/1M</Label>
                      <Input
                        className="h-9 rounded-xl"
                        {...form.register("outputPer1M")}
                      />
                    </div>
                  </div>
                ) : null}
                {billing === "per_image" || billing === "tiered" ? (
                  <div className="space-y-2">
                    <Label>¥/张</Label>
                    <Input
                      className="h-9 rounded-xl"
                      {...form.register("perImage")}
                    />
                  </div>
                ) : null}
                {billing === "per_second" || billing === "tiered" ? (
                  <div className="space-y-2">
                    <Label>¥/秒</Label>
                    <Input
                      className="h-9 rounded-xl"
                      {...form.register("perSecond")}
                    />
                  </div>
                ) : null}
                {billing === "per_video" || billing === "tiered" ? (
                  <div className="space-y-2">
                    <Label>¥/条</Label>
                    <Input
                      className="h-9 rounded-xl"
                      {...form.register("perVideo")}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>价格备注</Label>
                  <Input
                    className="h-9 rounded-xl"
                    placeholder="官方参考价 / 美元×7.2 等"
                    {...form.register("priceNote")}
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/80 p-3.5">
                <div className="text-sm font-medium">多模态能力</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>输入</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="text,image"
                      {...form.register("inputMods")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>输出</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="image"
                      {...form.register("outputMods")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>参考图上限</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="如 1 / 9 / 15"
                      {...form.register("maxRefImages")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>参考视频上限</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="如 1"
                      {...form.register("maxRefVideos")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>参考音频上限</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="如 1"
                      {...form.register("maxRefAudios")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>最长时长（秒）</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="如 15"
                      {...form.register("maxDurationSec")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>分辨率档</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="480p,720p,1080p"
                      {...form.register("resolutions")}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>画幅比例</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="16:9,9:16,1:1"
                      {...form.register("ratios")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>精确尺寸</Label>
                    <Input
                      className="h-9 rounded-xl"
                      placeholder="1024x1024,2048x2048"
                      {...form.register("sizes")}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>特性标签</Label>
                  <Input
                    className="h-9 rounded-xl"
                    placeholder="t2i, i2v, vision…"
                    {...form.register("features")}
                  />
                </div>
              </div>

            </div>
            <DialogFooter className="shrink-0 border-t border-border/70 px-6 py-4">
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
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ListPageShell>
  );
}
