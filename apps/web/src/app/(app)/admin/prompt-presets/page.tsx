"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "@/shared/lib/toast";
import { confirmDialog } from "@/shared/lib/confirm";
import { api, ApiError } from "@/shared/lib/api";
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


type PresetRow = {
  id: string;
  title: string;
  text: string;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "edit"; preset: PresetRow }
  | null;

const EMPTY_FORM = {
  title: "",
  text: "",
  enabled: true,
  sortOrder: 100,
};

const TITLE_MAX = 50;
const TEXT_MAX = 5000;

export default function AdminPromptPresetsPage() {
  const [rows, setRows] = useState<PresetRow[]>([]);
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

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("q", keyword.trim());
      if (enabledFilter === "on") params.set("enabled", "true");
      if (enabledFilter === "off") params.set("enabled", "false");
      const qs = params.toString();
      setRows(
        await api<PresetRow[]>(`/admin/prompt-presets${qs ? `?${qs}` : ""}`),
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
    kind: "prompt-presets",
    exportPath: "/admin/prompt-presets/export",
    importPath: "/admin/prompt-presets/import",
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

  function openEdit(preset: PresetRow) {
    setForm({
      title: preset.title,
      text: preset.text,
      enabled: preset.enabled,
      sortOrder: preset.sortOrder,
    });
    setDialog({ type: "edit", preset });
  }

  async function save() {
    if (!form.text.trim()) {
      toast.error("提示词内容必填");
      return;
    }
    setSaving(true);
    try {
      const body = {
        title: form.title.trim() || form.text.trim().slice(0, 24),
        text: form.text.trim(),
        enabled: form.enabled,
        sortOrder: form.sortOrder,
      };
      if (dialog?.type === "edit") {
        await api(`/admin/prompt-presets/${dialog.preset.id}`, {
          method: "PATCH",
          body,
        });
        toast.success("已保存");
      } else {
        await api("/admin/prompt-presets", { method: "POST", body });
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

  async function remove(preset: PresetRow) {
    const ok = await confirmDialog({
      title: "删除预设？",
      description: preset.title,
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/prompt-presets/${preset.id}`, { method: "DELETE" });
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
          title="提示词库"
          description="全局预设提示词，画布「预设词 · 全局」只读选用。"
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
                新建预设
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
              title="暂无全局预设"
              description="新建后，所有画布可在「全局」里选用。"
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
                  <TableHead className="w-[160px]">标题</TableHead>
                  <TableHead>提示词</TableHead>
                  <TableHead className="w-[88px]">状态</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) => (
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
                        aria-label={`选择 ${row.title}`}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {row.sortOrder}
                    </TableCell>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell>
                      <div className="line-clamp-2 text-[13px] text-muted-foreground">
                        {row.text}
                      </div>
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
                ))}
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
        title={dialog?.type === "edit" ? "编辑预设" : "新建预设"}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="preset-title">标题</Label>
              <span className="text-[12px] text-muted-foreground">
                {form.title.length}/{TITLE_MAX}
              </span>
            </div>
            <Input
              id="preset-title"
              value={form.title}
              maxLength={TITLE_MAX}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  title: e.target.value.slice(0, TITLE_MAX),
                }))
              }
              placeholder="给这条预设起个好记的名字"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="preset-text">提示词内容</Label>
              <span className="text-[12px] text-muted-foreground">
                {form.text.length}/{TEXT_MAX}
              </span>
            </div>
            <Textarea
              id="preset-text"
              value={form.text}
              maxLength={TEXT_MAX}
              rows={10}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  text: e.target.value.slice(0, TEXT_MAX),
                }))
              }
              placeholder="填入常用的提示词内容"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preset-sort">排序</Label>
            <Input
              id="preset-sort"
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
            <Label htmlFor="preset-enabled">启用</Label>
            <Switch
              id="preset-enabled"
              checked={form.enabled}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
