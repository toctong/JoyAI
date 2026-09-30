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


type BannerRow = {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string;
  coverKind: "image" | "video";
  posterUrl: string | null;
  ctaLabel: string | null;
  href: string | null;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "edit"; banner: BannerRow }
  | null;

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  coverUrl: "",
  coverKind: "image" as "image" | "video",
  posterUrl: "",
  ctaLabel: "免费体验",
  href: "/studio",
  enabled: true,
  sortOrder: 100,
};

function resolvePreview(url: string) {
  const u = url.trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return staticAssetUrl(u.startsWith("/") ? u : `/${u}`);
}

export default function AdminInspireBannersPage() {
  const [rows, setRows] = useState<BannerRow[]>([]);
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
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (enabledFilter === "on") params.set("enabled", "true");
      if (enabledFilter === "off") params.set("enabled", "false");
      const qs = params.toString();
      const data = await api<BannerRow[]>(
        `/admin/inspire-banners${qs ? `?${qs}` : ""}`,
      );
      setRows(data);
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载失败");
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
  }, [page, pageSize, rows]);

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const selection = useAdminSelection(pageIds);

  const io = useAdminImportExport({
    kind: "inspire-banners",
    exportPath: "/admin/inspire-banners/export",
    importPath: "/admin/inspire-banners/import",
    selectedIds: selection.selectedIds,
    onDone: async () => {
      selection.clear();
      await load();
    },
  });

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1);
    if (page > maxPage) setPage(maxPage);
  }, [page, pageSize, total]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ type: "create" });
  }

  function openEdit(banner: BannerRow) {
    setForm({
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      coverUrl: banner.coverUrl,
      coverKind: banner.coverKind,
      posterUrl: banner.posterUrl ?? "",
      ctaLabel: banner.ctaLabel ?? "",
      href: banner.href ?? "",
      enabled: banner.enabled,
      sortOrder: banner.sortOrder,
    });
    setDialog({ type: "edit", banner });
  }

  async function uploadMedia(
    file: File,
    kind: "cover" | "poster",
  ) {
    const setBusy = kind === "cover" ? setUploadingCover : setUploadingPoster;
    setBusy(true);
    try {
      const asset = await apiUpload<{ id: string; url: string }>("/upload", file);
      if (kind === "cover") {
        setForm((f) => ({ ...f, coverUrl: asset.url }));
      } else {
        setForm((f) => ({ ...f, posterUrl: asset.url }));
      }
      toast.success("已上传");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!form.title.trim() || !form.coverUrl.trim()) {
      toast.error("标题和封面必填");
      return;
    }
    if (form.coverKind === "video" && !form.posterUrl.trim()) {
      toast.error("视频封面请上传首帧图，避免轮播侧卡闪白");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        coverUrl: form.coverUrl.trim(),
        coverKind: form.coverKind,
        posterUrl:
          form.coverKind === "video"
            ? form.posterUrl.trim() || null
            : null,
        ctaLabel: form.ctaLabel.trim() || null,
        href: form.href.trim() || null,
        enabled: form.enabled,
        sortOrder: form.sortOrder,
      };
      if (dialog?.type === "edit") {
        await api(`/admin/inspire-banners/${dialog.banner.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("已保存");
      } else {
        await api("/admin/inspire-banners", { method: "POST", body });
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

  async function remove(banner: BannerRow) {
    const ok = await confirmDialog({
      title: "删除横幅？",
      description: banner.title,
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/inspire-banners/${banner.id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="灵感横幅"
          description="灵感页顶部 3D 轮播：可配置文案、封面上传；视频需配首帧图。"
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
                新建横幅
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
            <AdminEmptyState title="暂无横幅" description="新建一张放到灵感页顶部。" />
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
                  <TableHead className="w-[56px]">排序</TableHead>
                  <TableHead className="w-[56px]">预览</TableHead>
                  <TableHead className="min-w-[120px]">标题</TableHead>
                  <TableHead className="min-w-[160px]">文案</TableHead>
                  <TableHead className="w-[72px]">类型</TableHead>
                  <TableHead className="min-w-[140px]">跳转</TableHead>
                  <TableHead className="w-[72px]">状态</TableHead>
                  <TableHead className="w-[100px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => {
                  const thumb = resolvePreview(
                    row.coverKind === "video"
                      ? row.posterUrl || row.coverUrl
                      : row.coverUrl,
                  );
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
                          aria-label={`选择 ${row.title}`}
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
                        <div className="font-medium leading-tight">{row.title}</div>
                        {row.ctaLabel ? (
                          <div className="mt-0.5 text-[12px] leading-tight text-muted-foreground">
                            CTA：{row.ctaLabel}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-[240px] py-2 text-[13px] leading-tight text-muted-foreground">
                        <span className="line-clamp-2">
                          {row.subtitle?.trim() || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-[13px]">
                        {row.coverKind === "video" ? "视频" : "图片"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate py-2 text-[13px]">
                        {row.href || "—"}
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
        title={dialog?.type === "edit" ? "编辑横幅" : "新建横幅"}
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
            <Label>标题文案</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="主标题"
            />
          </div>
          <div className="space-y-2">
            <Label>副标题文案</Label>
            <Input
              value={form.subtitle}
              onChange={(e) =>
                setForm((f) => ({ ...f, subtitle: e.target.value }))
              }
              placeholder="可选"
            />
          </div>
          <div className="space-y-2">
            <Label>按钮文案</Label>
            <Input
              value={form.ctaLabel}
              onChange={(e) =>
                setForm((f) => ({ ...f, ctaLabel: e.target.value }))
              }
              placeholder="如：免费体验"
            />
          </div>
          <div className="space-y-2">
            <Label>跳转链接</Label>
            <Input
              value={form.href}
              onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))}
              placeholder="/studio 或 https://…"
            />
          </div>
          <div className="space-y-2">
            <Label>封面类型</Label>
            <Select
              value={form.coverKind}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  coverKind: v === "video" ? "video" : "image",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">图片</SelectItem>
                <SelectItem value="video">视频</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              {form.coverKind === "video" ? "视频封面" : "图片封面"}
            </Label>
            <p className="text-[13px] text-muted-foreground">
              支持上传，也可粘贴已有 URL
            </p>
            <div className="flex gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                {form.coverUrl ? (
                  form.coverKind === "video" ? (
                    <video
                      src={resolvePreview(form.coverUrl)}
                      muted
                      playsInline
                      className="size-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvePreview(form.coverUrl)}
                      alt=""
                      className="size-full object-cover"
                    />
                  )
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImagePlus className="size-5" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <Input
                  value={form.coverUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coverUrl: e.target.value }))
                  }
                  placeholder={
                    form.coverKind === "video"
                      ? "视频 URL"
                      : "/inspire/hero-01.webp"
                  }
                />
                <div>
                  <input
                    id="inspire-banner-cover-file"
                    type="file"
                    accept={
                      form.coverKind === "video"
                        ? "video/mp4,video/webm,video/quicktime"
                        : "image/png,image/jpeg,image/webp,image/gif"
                    }
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void uploadMedia(file, "cover");
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploadingCover}
                    onClick={() =>
                      document
                        .getElementById("inspire-banner-cover-file")
                        ?.click()
                    }
                  >
                    <Upload className="size-3.5" />
                    {uploadingCover ? "上传中…" : "上传封面"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {form.coverKind === "video" ? (
            <div className="space-y-2">
              <Label>首帧图（必填）</Label>
              <p className="text-[13px] text-muted-foreground">
                侧卡与切换过渡用静态图，避免视频未播时闪白
              </p>
              <div className="flex gap-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted">
                  {form.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolvePreview(form.posterUrl)}
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
                    value={form.posterUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, posterUrl: e.target.value }))
                    }
                    placeholder="首帧图 URL"
                  />
                  <div>
                    <input
                      id="inspire-banner-poster-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadMedia(file, "poster");
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploadingPoster}
                      onClick={() =>
                        document
                          .getElementById("inspire-banner-poster-file")
                          ?.click()
                      }
                    >
                      <Upload className="size-3.5" />
                      {uploadingPoster ? "上传中…" : "上传首帧"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>排序（越小越前）</Label>
            <Input
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
          <div className="flex items-center justify-between">
            <Label>启用</Label>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
