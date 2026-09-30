"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mic2, Plus, Volume2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { api, ApiError } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
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
import { AdminAudioPlayer } from "@/components/admin/admin-audio-player";
import { AdminImportExportButtons } from "@/components/admin/admin-import-export";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  downloadJson,
  pickJsonFile,
  readJsonFile,
  stampFilename,
} from "@/features/admin/admin-json-io";
import {
  normalizeGenderLabel,
  resolveAudio,
  VoiceTableUiProvider,
  VOICE_COLUMNS,
  type VoiceRow,
} from "@/features/admin/voices-columns";

type DialogMode =
  | { type: "create" }
  | { type: "edit"; voice: VoiceRow }
  | null;

type AudioChannelOpt = { id: string; name: string; platform: string };

const EMPTY_FORM = {
  slug: "",
  label: "",
  voiceId: "",
  channelId: "",
  gender: "",
  language: "zh",
  category: "通用",
  description: "",
  sampleText: "",
  previewAudioUrl: "",
  enabled: true,
  sortOrder: 100,
};

export default function AdminVoicesPage() {
  const [rows, setRows] = useState<VoiceRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [audioChannels, setAudioChannels] = useState<AudioChannelOpt[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [previewingIds, setPreviewingIds] = useState<string[]>([]);
  const [batchPreviewing, setBatchPreviewing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ioBusy, setIoBusy] = useState<"export" | "import" | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (enabledFilter === "on") params.set("enabled", "true");
      if (enabledFilter === "off") params.set("enabled", "false");
      if (channelFilter !== "all") params.set("channelId", channelFilter);
      const qs = params.toString();
      const [voiceRows, channels] = await Promise.all([
        api<VoiceRow[]>(`/admin/voices${qs ? `?${qs}` : ""}`),
        api<AudioChannelOpt[]>("/admin/voices/audio-channels").catch(
          () => [] as AudioChannelOpt[],
        ),
      ]);
      setRows(voiceRows);
      setAudioChannels(channels);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setRefreshing(false);
    }
  }, [channelFilter, enabledFilter, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ type: "create" });
  }

  const openEdit = useCallback((voice: VoiceRow) => {
    setForm({
      slug: voice.slug,
      label: voice.label,
      voiceId: voice.voiceId,
      channelId:
        voice.channelId ||
        voice.resolvedModel?.channelId ||
        "",
      gender: normalizeGenderLabel(voice.gender),
      language: voice.language ?? "",
      category: voice.category || "通用",
      description: voice.description ?? "",
      sampleText: voice.sampleText ?? "",
      previewAudioUrl: voice.previewAudioUrl ?? "",
      enabled: voice.enabled,
      sortOrder: voice.sortOrder,
    });
    setDialog({ type: "edit", voice });
  }, []);

  async function save() {
    setSaving(true);
    try {
      if (!form.channelId.trim()) {
        toast.error("请选择渠道");
        setSaving(false);
        return;
      }
      const body = {
        slug: form.slug.trim(),
        label: form.label.trim(),
        voiceId: form.voiceId.trim(),
        channelId: form.channelId.trim(),
        gender: form.gender.trim() || null,
        language: form.language.trim() || null,
        category: form.category.trim() || "通用",
        description: form.description.trim() || null,
        sampleText: form.sampleText.trim() || null,
        previewAudioUrl: form.previewAudioUrl.trim() || null,
        enabled: form.enabled,
        sortOrder: Number(form.sortOrder) || 100,
      };
      if (dialog?.type === "edit") {
        await api(`/admin/voices/${dialog.voice.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("已保存");
      } else {
        await api("/admin/voices", { method: "POST", body });
        toast.success("已创建");
      }
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const remove = useCallback(
    async (voice: VoiceRow) => {
      const ok = await confirmDialog({
        title: "删除音色",
        description: `确定删除「${voice.label}」？`,
      });
      if (!ok) return;
      try {
        await api(`/admin/voices/${voice.id}`, { method: "DELETE" });
        setSelectedIds((ids) => ids.filter((id) => id !== voice.id));
        toast.success("已删除");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    },
    [load],
  );

  const patchRows = useCallback(
    (patch: Record<string, Partial<VoiceRow>>) => {
      setRows((prev) =>
        prev.map((row) => {
          const next = patch[row.id];
          return next ? { ...row, ...next } : row;
        }),
      );
    },
    [],
  );

  const generatePreview = useCallback(
    async (voice: VoiceRow) => {
      const ok = await confirmDialog({
        title: "生成试听",
        description: voice.previewAudioUrl
          ? `将调用 TTS 为「${voice.label}」重新生成试听并覆盖现有音频。`
          : `将调用 TTS 为「${voice.label}」生成试听并写入对象存储。`,
        confirmText: "开始生成",
      });
      if (!ok) return;
      setPreviewingIds((ids) =>
        ids.includes(voice.id) ? ids : [...ids, voice.id],
      );
      try {
        const res = await api<{
          previewAudioUrl: string;
          modelName?: string;
        }>(`/admin/voices/${voice.id}/preview`, {
          method: "POST",
          body: {},
        });
        patchRows({
          [voice.id]: { previewAudioUrl: res.previewAudioUrl },
        });
        setForm((f) =>
          f.slug === voice.slug
            ? { ...f, previewAudioUrl: res.previewAudioUrl }
            : f,
        );
        toast.success(
          res.modelName
            ? `试听已生成（${res.modelName}）`
            : "试听已生成",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "生成试听失败");
      } finally {
        setPreviewingIds((ids) => ids.filter((id) => id !== voice.id));
      }
    },
    [patchRows],
  );

  async function generateSelectedPreviews() {
    if (selectedIds.length === 0) {
      toast.message("请先勾选要生成的音色");
      return;
    }
    const ok = await confirmDialog({
      title: "批量生成试听",
      description: `将对已勾选的 ${selectedIds.length} 条音色各调用一次 TTS 并写入对象存储。已有试听也会重跑覆盖。`,
      confirmText: "开始生成",
    });
    if (!ok) return;
    const ids = [...selectedIds];
    setBatchPreviewing(true);
    setPreviewingIds((prev) => [...new Set([...prev, ...ids])]);
    try {
      const res = await api<{
        total: number;
        succeeded: number;
        failed: number;
        results?: Array<{
          id: string;
          ok: boolean;
          previewAudioUrl?: string | null;
          error?: string;
        }>;
      }>("/admin/voices/generate-previews", {
        method: "POST",
        body: { ids },
      });
      const patch: Record<string, Partial<VoiceRow>> = {};
      for (const item of res.results ?? []) {
        if (item.ok && item.previewAudioUrl) {
          patch[item.id] = { previewAudioUrl: item.previewAudioUrl };
        }
      }
      if (Object.keys(patch).length) patchRows(patch);
      toast.success(
        `批量完成：成功 ${res.succeeded} · 失败 ${res.failed}（共 ${res.total}）`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "批量生成失败");
    } finally {
      setBatchPreviewing(false);
      setPreviewingIds((prev) => prev.filter((id) => !ids.includes(id)));
    }
  }

  async function handleExport() {
    setIoBusy("export");
    try {
      const ids = selectedIds.filter(Boolean);
      const qs = ids.length
        ? `?${ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&")}`
        : "";
      const data = await api<unknown>(`/admin/voices/export${qs}`);
      downloadJson(stampFilename("voices"), data);
      toast.success(
        ids.length ? `已导出所选 ${ids.length} 条` : "已导出全部",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setIoBusy(null);
    }
  }

  async function handleImport() {
    const file = await pickJsonFile();
    if (!file) return;
    setIoBusy("import");
    try {
      const body = await readJsonFile(file);
      const res = await api<{ created: number; updated: number; total: number }>(
        "/admin/voices/import",
        { method: "POST", body },
      );
      toast.success(
        `导入完成：新建 ${res.created} · 更新 ${res.updated}（共 ${res.total}）`,
      );
      setSelectedIds([]);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setIoBusy(null);
    }
  }

  const onToggle = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  }, []);

  const onTogglePage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        if (checked) return [...new Set([...prev, ...pageIds])];
        return prev.filter((id) => !pageIds.includes(id));
      });
    },
    [pageIds],
  );

  const voiceTableUi = useMemo(
    () => ({
      selectedIds,
      pageIds,
      previewingIds,
      onToggle,
      onTogglePage,
      onPreview: generatePreview,
      onEdit: openEdit,
      onRemove: remove,
    }),
    [
      generatePreview,
      onToggle,
      onTogglePage,
      openEdit,
      pageIds,
      previewingIds,
      remove,
      selectedIds,
    ],
  );

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="音色库"
          description="管理 TTS 音色；勾选后可批量生成试听，支持 JSON 导入导出。"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索名称 / voiceId / 分类"
          filters={
            <>
              <Select
                value={channelFilter}
                onValueChange={(v) => {
                  setChannelFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-[180px] shrink-0 px-3">
                  <SelectValue placeholder="渠道" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部渠道</SelectItem>
                  {audioChannels.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={enabledFilter}
                onValueChange={(v) => {
                  setEnabledFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-10 w-[132px] shrink-0 px-3">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="on">已启用</SelectItem>
                  <SelectItem value="off">已停用</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <AdminImportExportButtons
                exporting={ioBusy === "export"}
                importing={ioBusy === "import"}
                selectedCount={selectedIds.length}
                onExport={() => void handleExport()}
                onImport={() => void handleImport()}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={
                  batchPreviewing ||
                  selectedIds.length === 0 ||
                  previewingIds.length > 0
                }
                onClick={() => void generateSelectedPreviews()}
              >
                {batchPreviewing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Mic2 className="size-3.5" />
                )}
                批量生成
                {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
              </Button>
              <Button size="sm" className="h-9 rounded-xl" onClick={openCreate}>
                <Plus className="size-3.5" />
                新建音色
              </Button>
            </div>
          }
          refreshing={refreshing}
          onRefresh={() => void load()}
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {!loaded ? (
            <AdminListSkeleton rows={6} />
          ) : pageRows.length === 0 ? (
            <AdminEmptyState
              title="暂无音色"
              description="可通过导入 JSON 或手动新建。"
              action={
                <Button size="sm" className="h-9 rounded-xl" onClick={openCreate}>
                  <Plus className="size-3.5" />
                  新建音色
                </Button>
              }
            />
          ) : (
            <VoiceTableUiProvider value={voiceTableUi}>
              <DataTable
                columns={VOICE_COLUMNS}
                data={pageRows}
                getRowId={(row) => row.id}
                className="min-w-[1220px]"
              />
            </VoiceTableUiProvider>
          )}
        </ListPageCard>
      </ListPageMain>

      <ListPageFooter>
        <ListPagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </ListPageFooter>

      <AdminDrawer
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={dialog?.type === "edit" ? "编辑音色" : "新建音色"}
        description="voiceId 需与所选渠道的 TTS 音色一致"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDialog(null)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="voice-label">名称</Label>
            <Input
              id="voice-label"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="如：龙安洋"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-slug">Slug</Label>
            <Input
              id="voice-slug"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="cosy-longanyang"
              className="font-mono"
              disabled={dialog?.type === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-id">voiceId（渠道音色 ID）</Label>
            <Input
              id="voice-id"
              value={form.voiceId}
              onChange={(e) =>
                setForm((f) => ({ ...f, voiceId: e.target.value }))
              }
              placeholder="alloy / longanyang / zh_female_…"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>渠道</Label>
            <Select
              value={form.channelId || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, channelId: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择渠道" />
              </SelectTrigger>
              <SelectContent>
                {audioChannels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-category">分类</Label>
            <Input
              id="voice-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="通用"
            />
          </div>
          <div className="space-y-2">
            <Label>性别</Label>
            <Select
              value={form.gender || "none"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  gender: v === "none" ? "" : v,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="选择性别" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不填</SelectItem>
                <SelectItem value="男">男</SelectItem>
                <SelectItem value="女">女</SelectItem>
                <SelectItem value="其他">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>语言</Label>
            <Select
              value={form.language || "zh"}
              onValueChange={(v) => setForm((f) => ({ ...f, language: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="语言" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">英文</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-desc">说明</Label>
            <Input
              id="voice-desc"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="可选描述"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-sample">试听台词</Label>
            <Textarea
              id="voice-sample"
              rows={3}
              value={form.sampleText}
              onChange={(e) =>
                setForm((f) => ({ ...f, sampleText: e.target.value }))
              }
              placeholder="生成试听时使用的默认文本"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-preview-url">试听 URL</Label>
            <Input
              id="voice-preview-url"
              value={form.previewAudioUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, previewAudioUrl: e.target.value }))
              }
              placeholder="可留空，列表里点麦克风生成"
              className="font-mono"
            />
            {form.previewAudioUrl ? (
              <AdminAudioPlayer
                className="joy-admin-audio--wide"
                src={resolveAudio(form.previewAudioUrl)}
              />
            ) : (
              <p className="flex items-center gap-1 text-[12px] text-muted-foreground">
                <Volume2 className="size-3.5" />
                生成时会按所选渠道匹配已启用的音频模型
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="voice-sort">排序</Label>
            <Input
              id="voice-sort"
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  sortOrder: Number(e.target.value) || 0,
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-transparent bg-muted px-3 py-2">
            <Label htmlFor="voice-enabled">启用</Label>
            <Switch
              id="voice-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
