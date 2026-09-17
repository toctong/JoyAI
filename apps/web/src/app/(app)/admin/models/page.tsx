"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import {
  AdapterId,
  ImageProtocolProfileSchema,
  defaultAdapterId,
  type ModelCapabilities,
} from "@joyai/shared";
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
  capabilities?: ModelCapabilities | null;
  /** Resolved protocol adapter (openai-images / ark-video / …) */
  adapterId?: string | null;
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
  /** Empty = infer from channel platform */
  adapterId: z.string().optional(),
  imageProfile: z.string().optional(),
  modelAlias: z.string().optional(),
  imagePath: z.enum(["", "generations", "edits"]).optional(),
  asyncMode: z.boolean().optional(),
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

const AUTO = "__auto__";

const IMAGE_ADAPTER_OPTIONS = [
  { value: AUTO, label: "自动（按渠道推断）" },
  { value: AdapterId.OPENAI_IMAGES, label: "openai-images · OpenAI 兼容" },
  { value: AdapterId.ARK_IMAGES, label: "ark-images · 火山 Ark" },
  { value: AdapterId.DASHSCOPE_IMAGES, label: "dashscope-images · 百炼" },
] as const;

const VIDEO_ADAPTER_OPTIONS = [
  { value: AUTO, label: "自动（按渠道推断）" },
  { value: AdapterId.OPENAI_VIDEOS, label: "openai-videos · OpenAI 兼容" },
  { value: AdapterId.ARK_VIDEO, label: "ark-video · 火山 Ark" },
  { value: AdapterId.DASHSCOPE_VIDEO, label: "dashscope-video · 百炼" },
] as const;

const IMAGE_PROFILE_OPTIONS = [
  { value: AUTO, label: "自动推断" },
  ...ImageProtocolProfileSchema.options.map((id) => ({
    value: id,
    label: id,
  })),
];

const IMAGE_PATH_OPTIONS = [
  { value: AUTO, label: "默认" },
  { value: "generations", label: "/images/generations" },
  { value: "edits", label: "/images/edits" },
] as const;

function adapterOptionsForKind(kind: FormValues["kind"]) {
  if (kind === "image") return IMAGE_ADAPTER_OPTIONS;
  if (kind === "video") return VIDEO_ADAPTER_OPTIONS;
  return [{ value: AUTO, label: "LLM 无需适配器" }] as const;
}

function toSelectValue(raw?: string | null) {
  return raw?.trim() ? raw.trim() : AUTO;
}

function fromSelectValue(v: string) {
  return v === AUTO ? "" : v;
}

function numOrUndef(s?: string) {
  if (s == null || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
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

  const caps: ModelCapabilities = {
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

  const adapterId = values.adapterId?.trim();
  if (adapterId) caps.adapterId = adapterId;

  if (values.kind === "image" || values.kind === "video") {
    if (values.asyncMode) caps.async = true;
  }

  if (values.kind === "image") {
    const imageProfile = values.imageProfile?.trim();
    const modelAlias = values.modelAlias?.trim();
    const imagePath = values.imagePath?.trim();
    if (imageProfile || modelAlias || imagePath) {
      caps.protocol = {
        ...(imageProfile ? { imageProfile } : {}),
        ...(modelAlias ? { modelAlias } : {}),
        ...(imagePath === "generations" || imagePath === "edits"
          ? { imagePath }
          : {}),
      };
    }
  }

  return caps;
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
      adapterId: "",
      imageProfile: "",
      modelAlias: "",
      imagePath: "",
      asyncMode: false,
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

  const formKind = form.watch("kind");
  const formChannelId = form.watch("channelId");
  const formAdapterId = form.watch("adapterId");

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
      adapterId: "",
      imageProfile: "",
      modelAlias: "",
      imagePath: "",
      asyncMode: false,
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
    const c = m.capabilities;
    form.reset({
      channelId: m.channelId,
      name: m.name,
      kind: m.kind as "image" | "video" | "llm",
      remoteId: m.remoteId,
      description: m.description ?? "",
      adapterId: c?.adapterId ?? "",
      imageProfile: c?.protocol?.imageProfile ?? "",
      modelAlias: c?.protocol?.modelAlias ?? "",
      imagePath: c?.protocol?.imagePath ?? "",
      asyncMode: Boolean(c?.async),
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
      const capabilities = buildCapabilities(values);
      if (editing) {
        await api(`/admin/models/${editing.id}`, {
          method: "PATCH",
          body: {
            name: values.name,
            remoteId: values.remoteId,
            description: values.description,
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

  const modelGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        channelId: string;
        channelName: string;
        platform?: string;
        items: Model[];
      }
    >();
    for (const m of models) {
      const key = m.channelId || "unknown";
      let group = map.get(key);
      if (!group) {
        group = {
          channelId: key,
          channelName: m.channel?.name ?? "未分组渠道",
          platform: m.channel?.platform,
          items: [],
        };
        map.set(key, group);
      }
      group.items.push(m);
    }
    return [...map.values()].sort((a, b) =>
      a.channelName.localeCompare(b.channelName, "zh"),
    );
  }, [models]);

  const selectedChannel = channels.find((c) => c.id === formChannelId);
  const inferredAdapter =
    formKind !== "llm" && selectedChannel?.platform
      ? defaultAdapterId(selectedChannel.platform, formKind)
      : null;
  const showOpenaiProtocol =
    formKind === "image" &&
    (formAdapterId === AdapterId.OPENAI_IMAGES ||
      (!formAdapterId && inferredAdapter === AdapterId.OPENAI_IMAGES));

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
          description="图片 / 视频 / LLM · 协议适配与多模态能力"
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
            <div className="space-y-5">
              {modelGroups.map((group) => (
                <section key={group.channelId} className="space-y-2.5">
                  <div className="flex items-center gap-2 px-0.5">
                    <BrandAvatar
                      src={
                        group.platform
                          ? channelIconSrc(group.platform)
                          : null
                      }
                      label={group.channelName}
                      size={18}
                      rounded="md"
                    />
                    <h2 className="text-sm font-medium">{group.channelName}</h2>
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px]"
                    >
                      {group.items.length}
                    </Badge>
                  </div>
                  <div className="joy-admin-card-grid">
                    {group.items.map((m) => (
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
                              <h3
                                className="joy-admin-card-item-title"
                                title={m.name}
                              >
                                {m.name}
                              </h3>
                              <p
                                className="joy-admin-card-item-sub"
                                title={m.remoteId}
                              >
                                {m.remoteId}
                              </p>
                              {m.adapterId ? (
                                <p
                                  className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80"
                                  title={`adapter: ${m.adapterId}`}
                                >
                                  {m.adapterId}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <Badge variant="secondary">{kindLabel(m.kind)}</Badge>
                        </div>
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
                </section>
              ))}
            </div>
          </div>
        ) : (
          <ListPageCard className="admin-table">
            <Table className="min-w-[1120px]">
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
                  <TableHead className="min-w-[120px] whitespace-nowrap">
                    适配器
                  </TableHead>
                  <TableHead className="min-w-[140px] whitespace-nowrap">
                    渠道
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
                {modelGroups.map((group) => (
                  <Fragment key={group.channelId}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="bg-muted/40 py-2.5">
                        <div className="flex items-center gap-2">
                          <BrandAvatar
                            src={
                              group.platform
                                ? channelIconSrc(group.platform)
                                : null
                            }
                            label={group.channelName}
                            size={16}
                            rounded="md"
                          />
                          <span className="text-sm font-medium">
                            {group.channelName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {group.items.length} 个模型
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {group.items.map((m) => (
                      <TableRow
                        key={m.id}
                        data-state={
                          selectedIds.includes(m.id) ? "selected" : undefined
                        }
                      >
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
                        <TableCell className="min-w-[120px] max-w-[160px]">
                          {m.adapterId ? (
                            <span
                              className="truncate font-mono text-[11px] text-muted-foreground"
                              title={m.adapterId}
                            >
                              {m.adapterId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
                  </Fragment>
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
                        form.setValue("adapterId", "");
                        form.setValue("imageProfile", "");
                        form.setValue("modelAlias", "");
                        form.setValue("imagePath", "");
                        if (kind === "llm") {
                          form.setValue("outputMods", "text");
                          form.setValue("asyncMode", false);
                        } else if (kind === "image") {
                          form.setValue("outputMods", "image");
                        } else {
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
                <div className="text-sm font-medium">协议适配</div>
                <div className="space-y-2">
                  <Label>适配器</Label>
                  <Select
                    value={toSelectValue(formAdapterId)}
                    onValueChange={(v) =>
                      form.setValue("adapterId", fromSelectValue(v))
                    }
                    disabled={formKind === "llm"}
                  >
                    <SelectTrigger className="h-9 rounded-xl">
                      <SelectValue placeholder="选择适配器" />
                    </SelectTrigger>
                    <SelectContent>
                      {adapterOptionsForKind(formKind).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[12px] text-muted-foreground">
                    {inferredAdapter
                      ? `当前渠道默认推断为 ${inferredAdapter}；留空则使用推断。`
                      : formKind === "llm"
                        ? "LLM 仅作目录展示，不走生成适配器。"
                        : "请选择渠道后可查看默认推断。"}
                  </p>
                </div>
                {formKind !== "llm" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={!!form.watch("asyncMode")}
                      onCheckedChange={(v) => form.setValue("asyncMode", v)}
                    />
                    异步任务（submit + poll）
                  </label>
                ) : null}
                {showOpenaiProtocol ? (
                  <>
                    <div className="space-y-2">
                      <Label>图片方言 imageProfile</Label>
                      <Select
                        value={toSelectValue(form.watch("imageProfile"))}
                        onValueChange={(v) =>
                          form.setValue("imageProfile", fromSelectValue(v))
                        }
                      >
                        <SelectTrigger className="h-9 rounded-xl">
                          <SelectValue placeholder="自动推断" />
                        </SelectTrigger>
                        <SelectContent>
                          {IMAGE_PROFILE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>模型别名</Label>
                        <Input
                          className="h-9 rounded-xl font-mono text-xs"
                          placeholder="可选，发送前改写 remoteId"
                          {...form.register("modelAlias")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>API 路径</Label>
                        <Select
                          value={toSelectValue(form.watch("imagePath"))}
                          onValueChange={(v) =>
                            form.setValue(
                              "imagePath",
                              fromSelectValue(v) as FormValues["imagePath"],
                            )
                          }
                        >
                          <SelectTrigger className="h-9 rounded-xl">
                            <SelectValue placeholder="默认 generations" />
                          </SelectTrigger>
                          <SelectContent>
                            {IMAGE_PATH_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                ) : null}
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
