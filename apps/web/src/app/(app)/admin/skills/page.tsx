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

type SkillCategory = "manju" | "canvas" | "tools" | "general";

type SkillRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: SkillCategory;
  purpose: string;
  systemPrompt: string;
  enabled: boolean;
  builtin: boolean;
  sortOrder: number;
  updatedAt: string;
};

type DialogMode =
  | { type: "create" }
  | { type: "edit"; skill: SkillRow }
  | null;

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  manju: "漫剧",
  canvas: "画布",
  tools: "工具",
  general: "通用",
};

const EMPTY_FORM = {
  slug: "",
  name: "",
  description: "",
  category: "manju" as SkillCategory,
  purpose: "",
  systemPrompt: "",
  enabled: true,
  sortOrder: 100,
};

export default function AdminSkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (enabledFilter === "on") params.set("enabled", "true");
      if (enabledFilter === "off") params.set("enabled", "false");
      if (keyword.trim()) params.set("q", keyword.trim());
      const qs = params.toString();
      setSkills(
        await api<SkillRow[]>(`/admin/skills${qs ? `?${qs}` : ""}`),
      );
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载技能失败");
    } finally {
      setRefreshing(false);
    }
  }, [categoryFilter, enabledFilter, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return skills.slice(start, start + pageSize);
  }, [skills, page, pageSize]);

  function resetPageAnd(fn: () => void) {
    setPage(1);
    fn();
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setDialog({ type: "create" });
  }

  function openEdit(skill: SkillRow) {
    setForm({
      slug: skill.slug,
      name: skill.name,
      description: skill.description ?? "",
      category: skill.category,
      purpose: skill.purpose,
      systemPrompt: skill.systemPrompt,
      enabled: skill.enabled,
      sortOrder: skill.sortOrder,
    });
    setDialog({ type: "edit", skill });
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("请填写名称");
      return;
    }
    if (!form.systemPrompt.trim()) {
      toast.error("请填写系统提示词");
      return;
    }
    if (dialog?.type === "create") {
      if (!form.slug.trim() || !form.purpose.trim()) {
        toast.error("请填写 slug 与 purpose");
        return;
      }
    }

    setSaving(true);
    try {
      if (dialog?.type === "create") {
        await api("/admin/skills", {
          method: "POST",
          body: {
            slug: form.slug.trim(),
            name: form.name.trim(),
            description: form.description.trim() || undefined,
            category: form.category,
            purpose: form.purpose.trim(),
            systemPrompt: form.systemPrompt.trim(),
            enabled: form.enabled,
            sortOrder: form.sortOrder,
          },
        });
        toast.success("已创建技能");
      } else if (dialog?.type === "edit") {
        await api(`/admin/skills/${dialog.skill.id}`, {
          method: "PATCH",
          body: {
            name: form.name.trim(),
            description: form.description.trim() || null,
            category: form.category,
            purpose: dialog.skill.builtin
              ? undefined
              : form.purpose.trim(),
            systemPrompt: form.systemPrompt.trim(),
            enabled: dialog.skill.builtin ? true : form.enabled,
            sortOrder: form.sortOrder,
          },
        });
        toast.success("已保存");
      }
      setDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(skill: SkillRow) {
    if (skill.builtin) {
      toast.error("内置技能不可停用");
      return;
    }
    try {
      await api(`/admin/skills/${skill.id}`, {
        method: "PATCH",
        body: { enabled: !skill.enabled },
      });
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "更新失败");
    }
  }

  async function removeSkill(skill: SkillRow) {
    if (skill.builtin) {
      toast.error("内置技能不可删除，可改为停用");
      return;
    }
    const ok = await confirmDialog({
      title: "删除技能",
      description: `确定删除「${skill.name}」？此操作不可恢复。`,
      confirmText: "删除",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/skills/${skill.id}`, { method: "DELETE" });
      toast.success("已删除");
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  const hasFilters =
    !!keyword || categoryFilter !== "all" || enabledFilter !== "all";

  return (
    <ListPageShell>
      <ListPageHeader>
        <PageHeader
          title="技能"
          description="内置技能不可删除、不可停用；可编辑系统提示词。运行时 LLM 按 purpose 读取已启用技能。"
          className="mb-0"
        />
        <ListToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          onSearchSubmit={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          searchPlaceholder="搜索名称 / slug / purpose"
          filters={
            <>
              <Select
                value={categoryFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setCategoryFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[120px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  <SelectItem value="manju">漫剧</SelectItem>
                  <SelectItem value="canvas">画布</SelectItem>
                  <SelectItem value="tools">工具</SelectItem>
                  <SelectItem value="general">通用</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={enabledFilter}
                onValueChange={(v) =>
                  resetPageAnd(() => setEnabledFilter(v))
                }
              >
                <SelectTrigger className="h-9 w-[120px] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="on">已启用</SelectItem>
                  <SelectItem value="off">已停用</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => void load()}
          refreshing={refreshing}
          actions={
            <Button
              size="sm"
              className="h-9 rounded-xl"
              onClick={openCreate}
            >
              <Plus className="size-3.5" />
              新建技能
            </Button>
          }
        />
      </ListPageHeader>

      <ListPageMain>
        <ListPageCard scroll className="admin-table">
          {!loaded ? (
            <AdminListSkeleton cols={6} rows={6} />
          ) : pageItems.length === 0 ? (
            <AdminEmptyState
              title={hasFilters ? "没有匹配的技能" : "暂无技能"}
              description={
                hasFilters
                  ? "试试调整搜索或筛选"
                  : "启动服务后会自动写入内置技能"
              }
              action={
                !hasFilters ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="size-3.5" />
                    新建技能
                  </Button>
                ) : null
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>purpose</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-[88px]">排序</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((skill) => (
                  <TableRow key={skill.id}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{skill.name}</span>
                          {skill.builtin ? (
                            <Badge
                              variant="outline"
                              className="rounded-md px-1.5 font-normal"
                            >
                              内置
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {skill.slug}
                          {skill.description
                            ? ` · ${skill.description}`
                            : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {CATEGORY_LABEL[skill.category] ?? skill.category}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{skill.purpose}</code>
                    </TableCell>
                    <TableCell>
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={skill.enabled}
                          onCheckedChange={() => void toggleEnabled(skill)}
                        />
                        <span
                          className={cn(
                            "text-xs",
                            skill.enabled
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {skill.enabled ? "启用" : "停用"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{skill.sortOrder}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          onClick={() => openEdit(skill)}
                          aria-label="编辑"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          disabled={skill.builtin}
                          onClick={() => void removeSkill(skill)}
                          aria-label="删除"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
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
          total={skills.length}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </ListPageFooter>

      <AdminDrawer
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={
          dialog?.type === "create"
            ? "新建技能"
            : dialog?.type === "edit"
              ? `编辑 · ${dialog.skill.name}`
              : ""
        }
        description="系统提示词会在对应 purpose 的 LLM 任务中作为 system 消息使用"
        widthClassName="sm:max-w-[840px]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="skill-name">名称</Label>
              <Input
                id="skill-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="资产分析"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-slug">slug</Label>
              <Input
                id="skill-slug"
                value={form.slug}
                disabled={dialog?.type === "edit"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slug: e.target.value }))
                }
                placeholder="analyze-assets"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>分类</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    category: v as SkillCategory,
                  }))
                }
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manju">漫剧</SelectItem>
                  <SelectItem value="canvas">画布</SelectItem>
                  <SelectItem value="tools">工具</SelectItem>
                  <SelectItem value="general">通用</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-purpose">purpose</Label>
              <Input
                id="skill-purpose"
                value={form.purpose}
                disabled={
                  dialog?.type === "edit" && dialog.skill.builtin
                }
                onChange={(e) =>
                  setForm((f) => ({ ...f, purpose: e.target.value }))
                }
                placeholder="analyze_assets"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skill-desc">说明</Label>
            <Input
              id="skill-desc"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="一句话说明技能用途"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="skill-sort">排序</Label>
              <Input
                id="skill-sort"
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
            <div className="flex items-end gap-3 pb-1">
              <Switch
                checked={form.enabled}
                disabled={dialog?.type === "edit" && dialog.skill.builtin}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, enabled: v }))
                }
              />
              <Label>
                {dialog?.type === "edit" && dialog.skill.builtin
                  ? "内置启用（不可停用）"
                  : "启用"}
              </Label>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="skill-prompt">系统提示词</Label>
            <Textarea
              id="skill-prompt"
              value={form.systemPrompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, systemPrompt: e.target.value }))
              }
              className="min-h-[320px] font-mono text-xs leading-relaxed"
              placeholder="System prompt…"
            />
          </div>
        </div>
      </AdminDrawer>
    </ListPageShell>
  );
}
