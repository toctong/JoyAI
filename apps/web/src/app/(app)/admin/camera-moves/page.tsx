"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { api, apiUpload, ApiError } from "@/shared/lib/api";
import { staticAssetUrl } from "@/shared/lib/static-asset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { AdminImportExportButtons } from "@/components/admin/admin-import-export";
import { AdminSelectAllCheckbox } from "@/components/admin/admin-select-all-checkbox";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useAdminImportExport } from "@/features/admin/use-admin-import-export";
import { useAdminSelection } from "@/features/admin/use-admin-selection";


type MoveRow = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string | null;
  category: string;
  exclusiveGroup: string | null;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "edit"; move: MoveRow }
  | null;

const EMPTY_FORM = {
  slug: "",
  label: "",
  prompt: "",
  thumbUrl: "",
  category: "基础控制",
  exclusiveGroup: "",
  enabled: true,
  sortOrder: 100,
};

function resolvePreview(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

export default function AdminCameraMovesPage() {
  const [rows, setRows] = useState<MoveRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (enabledFilter === "on") params.set("enabled", "true");
      if (enabledFilter === "off") params.set("enabled", "false");
      const qs = params.toString();
      setRows(
        await api<MoveRow[]>(`/admin/camera-moves${qs ? `?${qs}` : ""}`),
      );
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setRefreshing(false);
    }
  }, [enabledFilter, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = rows.length;
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useAdminSelection(pageIds);

  const io = useAdminImportExport({
    kind: "camera-moves",
    exportPath: "/admin/camera-moves/export",
    importPath: "/admin/camera-moves/import",
    selectedIds: selection.selectedIds,
    onDone: async () => {
      selection.clear();
      await load();
    },
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ type: "create" });
  }

  function openEdit(move: MoveRow) {
    setForm({
      slug: move.slug,
      label: move.label,
      prompt: move.prompt,
      thumbUrl: move.thumbUrl ?? "",
      category: move.category || "基础控制",
      exclusiveGroup: move.exclusiveGroup ?? "",
      enabled: move.enabled,
      sortOrder: move.sortOrder,
    });
    setDialog({ type: "edit", move });
  }

  async function uploadThumb(file: File) {
    setUploading(true);
    try {
      const asset = await apiUpload<{ id: string; url: string }>("/upload", file);
      setForm((f) => ({ ...f, thumbUrl: asset.url }));
      toast.success("已上传");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.slug.trim() || !form.label.trim() || !form.prompt.trim()) {
      toast.error("slug、名称、运镜句必填");
      return;
    }
    setSaving(true);
    try {
      const body = {
        slug: form.slug.trim(),
        label: form.label.trim(),
        prompt: form.prompt.trim(),
        thumbUrl: form.thumbUrl.trim() || null,
        category: form.category.trim() || "基础控制",
        exclusiveGroup: form.exclusiveGroup.trim() || null,
        enabled: form.enabled,
        sortOrder: form.sortOrder,
      };
      if (dialog?.type === "edit") {
        await api(`/admin/camera-moves/${dialog.move.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("已保存");
      } else {
        await api("/admin/camera-moves", { method: "POST", body });
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

  async function remove(move: MoveRow) {
    const ok = await confirmDialog({
      title: "删除运镜？",
      description: move.label,
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/camera-moves/${move.id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  const preview = resolvePreview(form.thumbUrl);

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="运镜库"
          description="视频生成运镜卡片；可组合最多 3 个，同互斥组会互相替换。"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={() => {
            setKeyword(searchDraft);
            setPage(1);
          }}
          refreshing={refreshing}
          onRefresh={() => void load()}
          filters={
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
          }
          actions={
            <div className="flex items-center gap-2">
              <AdminImportExportButtons
                exporting={io.exporting}
                importing={io.importing}
                selectedCount={selection.selectedCount}
                onExport={() => void io.handleExport()}
                onImport={() => void io.handleImport()}
              />
              <Button size="sm" className="h-9 rounded-xl" onClick={openCreate}>
                <Plus className="size-4" />
                新建运镜
              </Button>
            </div>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {!loaded ? (
            <AdminListSkeleton rows={6} />
          ) : pageRows.length === 0 ? (
            <AdminEmptyState
              title="暂无运镜"
              description="新建后，视频节点「运镜」即可选用。"
            />
          ) : (
            <Table container={false}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <AdminSelectAllCheckbox
                      allSelected={selection.allPageSelected}
                      someSelected={selection.somePageSelected}
                      onToggle={selection.togglePage}
                    />
                  </TableHead>
                  <TableHead className="w-[72px]">排序</TableHead>
                  <TableHead className="w-[56px]">预览</TableHead>
                  <TableHead>名称 / slug</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>互斥组</TableHead>
                  <TableHead className="w-[88px]">状态</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const thumb = resolvePreview(row.thumbUrl ?? "");
                  return (
                    <TableRow
                      key={row.id}
                      data-state={
                        selection.selectedIds.includes(row.id)
                          ? "selected"
                          : undefined
                      }
                    >
                      <TableCell className="py-2">
                        <Checkbox
                          checked={selection.selectedIds.includes(row.id)}
                          onCheckedChange={(v) =>
                            selection.toggle(row.id, v === true)
                          }
                          aria-label={`选择 ${row.label}`}
                        />
                      </TableCell>
                      <TableCell className="py-2 tabular-nums text-muted-foreground">
                        {row.sortOrder}
                      </TableCell>
                      <TableCell className="w-[56px] py-2">
                        <div className="size-9 overflow-hidden rounded-lg border border-transparent bg-muted">
                          {thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumb}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="font-medium leading-tight">{row.label}</div>
                        <div className="mt-0.5 font-mono text-[12px] leading-tight text-muted-foreground">
                          {row.slug}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-[13px]">
                        {row.category}
                      </TableCell>
                      <TableCell className="py-2 font-mono text-[12px] text-muted-foreground">
                        {row.exclusiveGroup || "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        {row.enabled ? (
                          <Badge variant="secondary">启用</Badge>
                        ) : (
                          <Badge variant="outline">停用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => openEdit(row)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() => void remove(row)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
        title={dialog?.type === "edit" ? "编辑运镜" : "新建运镜"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="move-label">名称</Label>
            <Input
              id="move-label"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="如：镜头前推"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-slug">Slug</Label>
            <Input
              id="move-slug"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="dolly-in"
              className="font-mono"
              disabled={dialog?.type === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-prompt">运镜句</Label>
            <Textarea
              id="move-prompt"
              value={form.prompt}
              rows={4}
              onChange={(e) =>
                setForm((f) => ({ ...f, prompt: e.target.value }))
              }
              placeholder="写入视频提示词的运镜描述（建议英文）"
            />
          </div>
          <div className="space-y-2">
            <Label>封面（可选）</Label>
            <div className="flex gap-3">
              <div className="size-20 shrink-0 overflow-hidden rounded-xl border bg-muted">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="size-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={form.thumbUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, thumbUrl: e.target.value }))
                  }
                  placeholder="封面 URL 或上传"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/*";
                    input.onchange = () => {
                      const file = input.files?.[0];
                      if (file) void uploadThumb(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="size-3.5" />
                  {uploading ? "上传中…" : "上传封面"}
                </Button>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-category">分类</Label>
            <Input
              id="move-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="基础控制"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-group">互斥组</Label>
            <Input
              id="move-group"
              value={form.exclusiveGroup}
              onChange={(e) =>
                setForm((f) => ({ ...f, exclusiveGroup: e.target.value }))
              }
              placeholder="同组互斥，如 pan / dolly"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-sort">排序</Label>
            <Input
              id="move-sort"
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
            <Label htmlFor="move-enabled">启用</Label>
            <Switch
              id="move-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
