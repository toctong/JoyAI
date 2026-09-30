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
import { cn } from "@/shared/lib/utils";
import { useAdminImportExport } from "@/features/admin/use-admin-import-export";
import { useAdminSelection } from "@/features/admin/use-admin-selection";

type StyleSurface = "manju" | "canvas";

type StyleRow = {
  id: string;
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string;
  tone: string;
  enabled: boolean;
  sortOrder: number;
  surfaces: StyleSurface[];
  updatedAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "edit"; style: StyleRow }
  | null;

const EMPTY_FORM = {
  slug: "",
  label: "",
  prompt: "",
  thumbUrl: "",
  tone: "cinematic",
  enabled: true,
  sortOrder: 100,
  surfaces: ["manju", "canvas"] as StyleSurface[],
};

function resolvePreview(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

function toggleSurface(
  list: StyleSurface[],
  surface: StyleSurface,
  on: boolean,
): StyleSurface[] {
  if (on) return list.includes(surface) ? list : [...list, surface];
  return list.filter((s) => s !== surface);
}

export default function AdminStylesPage() {
  const [rows, setRows] = useState<StyleRow[]>([]);
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
      setRows(await api<StyleRow[]>(`/admin/styles${qs ? `?${qs}` : ""}`));
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
    kind: "styles",
    exportPath: "/admin/styles/export",
    importPath: "/admin/styles/import",
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

  function openEdit(style: StyleRow) {
    setForm({
      slug: style.slug,
      label: style.label,
      prompt: style.prompt,
      thumbUrl: style.thumbUrl,
      tone: style.tone || "cinematic",
      enabled: style.enabled,
      sortOrder: style.sortOrder,
      surfaces: style.surfaces?.length
        ? [...style.surfaces]
        : ["manju", "canvas"],
    });
    setDialog({ type: "edit", style });
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
      toast.error("slug、名称、风格句必填");
      return;
    }
    if (!form.thumbUrl.trim()) {
      toast.error("封面必填");
      return;
    }
    if (!form.surfaces.length) {
      toast.error("至少选择一个应用面");
      return;
    }
    setSaving(true);
    try {
      const body = {
        slug: form.slug.trim(),
        label: form.label.trim(),
        prompt: form.prompt.trim(),
        thumbUrl: form.thumbUrl.trim(),
        tone: form.tone.trim() || "cinematic",
        enabled: form.enabled,
        sortOrder: form.sortOrder,
        surfaces: form.surfaces,
      };
      if (dialog?.type === "edit") {
        await api(`/admin/styles/${dialog.style.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("已保存");
      } else {
        await api("/admin/styles", { method: "POST", body });
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

  async function remove(style: StyleRow) {
    const ok = await confirmDialog({
      title: "删除风格？",
      description: style.label,
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/styles/${style.id}`, { method: "DELETE" });
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
          title="风格库"
          description="全局风格模板，漫剧与画布生成面板共用。"
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
                新建风格
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
              title="暂无风格"
              description="新建后，漫剧与画布即可选用。"
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
                  <TableHead className="w-[72px]">预览</TableHead>
                  <TableHead>名称 / slug</TableHead>
                  <TableHead>风格句</TableHead>
                  <TableHead className="w-[120px]">应用面</TableHead>
                  <TableHead className="w-[88px]">状态</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const thumb = resolvePreview(row.thumbUrl);
                  return (
                    <TableRow
                      key={row.id}
                      data-state={
                        selection.selectedIds.includes(row.id)
                          ? "selected"
                          : undefined
                      }
                    >
                      <TableCell>
                        <Checkbox
                          checked={selection.selectedIds.includes(row.id)}
                          onCheckedChange={(v) =>
                            selection.toggle(row.id, v === true)
                          }
                          aria-label={`选择 ${row.label}`}
                        />
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.sortOrder}
                      </TableCell>
                      <TableCell>
                        <div className="size-12 overflow-hidden rounded-xl border bg-muted">
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
                      <TableCell>
                        <div className="font-medium">{row.label}</div>
                        <div className="mt-0.5 font-mono text-[12px] text-muted-foreground">
                          {row.slug}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="line-clamp-2 text-[13px] text-muted-foreground">
                          {row.prompt}
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {(row.surfaces ?? []).join(" · ") || "—"}
                      </TableCell>
                      <TableCell>
                        {row.enabled ? (
                          <Badge variant="secondary">启用</Badge>
                        ) : (
                          <Badge variant="outline">停用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
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
        title={dialog?.type === "edit" ? "编辑风格" : "新建风格"}
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
            <Label htmlFor="style-label">名称</Label>
            <Input
              id="style-label"
              value={form.label}
              onChange={(e) =>
                setForm((f) => ({ ...f, label: e.target.value }))
              }
              placeholder="如：真人写实"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-slug">Slug</Label>
            <Input
              id="style-slug"
              value={form.slug}
              onChange={(e) =>
                setForm((f) => ({ ...f, slug: e.target.value }))
              }
              placeholder="realistic"
              className="font-mono"
              disabled={dialog?.type === "edit"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-prompt">风格句</Label>
            <Textarea
              id="style-prompt"
              value={form.prompt}
              rows={4}
              onChange={(e) =>
                setForm((f) => ({ ...f, prompt: e.target.value }))
              }
              placeholder="写入生成提示词的完整风格描述"
            />
          </div>
          <div className="space-y-2">
            <Label>封面</Label>
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
                  placeholder="/manju/styles/….webp 或上传"
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
            <Label htmlFor="style-tone">色系回退</Label>
            <Input
              id="style-tone"
              value={form.tone}
              onChange={(e) =>
                setForm((f) => ({ ...f, tone: e.target.value }))
              }
              placeholder="cinematic"
            />
          </div>
          <div className="space-y-2">
            <Label>应用面</Label>
            <div className="flex gap-3">
              {(["manju", "canvas"] as const).map((surface) => {
                const on = form.surfaces.includes(surface);
                return (
                  <button
                    key={surface}
                    type="button"
                    className={cn(
                      "rounded-xl border border-transparent px-3.5 py-1.5 text-[13px] transition-colors",
                      on
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        surfaces: toggleSurface(f.surfaces, surface, !on),
                      }))
                    }
                  >
                    {surface === "manju" ? "漫剧" : "画布"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="style-sort">排序</Label>
            <Input
              id="style-sort"
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
            <Label htmlFor="style-enabled">启用</Label>
            <Switch
              id="style-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
