"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import { ApiError } from "@/shared/lib/api";
import {
  clearLocalPromptPresets,
  createCanvasPreset,
  deleteCanvasPreset,
  exportPromptPresetsJson,
  fetchCanvasPresets,
  fetchGlobalPresets,
  hasPendingLocalPresetMigration,
  importCanvasPresets,
  listLocalPromptPresets,
  parseImportPayload,
  PROMPT_PRESET_TEXT_MAX,
  PROMPT_PRESET_TITLE_MAX,
  updateCanvasPreset,
  type PromptPreset,
} from "./lib/prompt-presets";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; preset: PromptPreset };

type TabId = "global" | "canvas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Prefill create form from current composer draft. */
  draftText?: string;
  onApply: (text: string) => void;
  children: ReactNode;
};

/**
 * Canvas prompt-preset module: global (read-only) + per-project CRUD.
 */
export function CanvasPromptPresets({
  open,
  onOpenChange,
  projectId,
  draftText = "",
  onApply,
  children,
}: Props) {
  const [tab, setTab] = useState<TabId>("canvas");
  const [globalPresets, setGlobalPresets] = useState<PromptPreset[]>([]);
  const [canvasPresets, setCanvasPresets] = useState<PromptPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [showMigrate, setShowMigrate] = useState(false);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [globalList, canvasList] = await Promise.all([
        fetchGlobalPresets(),
        fetchCanvasPresets(projectId),
      ]);
      setGlobalPresets(globalList);
      setCanvasPresets(canvasList);
      setShowMigrate(hasPendingLocalPresetMigration());
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "加载预设失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!editor) return;
    if (editor.mode === "create") {
      const draft = draftText.trim().slice(0, PROMPT_PRESET_TEXT_MAX);
      setTitle("");
      setText(draft);
      return;
    }
    setTitle(editor.preset.title.slice(0, PROMPT_PRESET_TITLE_MAX));
    setText(editor.preset.text.slice(0, PROMPT_PRESET_TEXT_MAX));
  }, [editor, draftText]);

  function openCreate() {
    setEditor({ mode: "create" });
  }

  function openEdit(preset: PromptPreset) {
    setEditor({ mode: "edit", preset });
  }

  function closeEditor() {
    setEditor(null);
  }

  async function saveEditor() {
    try {
      if (editor?.mode === "edit") {
        await updateCanvasPreset(projectId, editor.preset.id, { title, text });
        toast.success("已更新预设");
      } else {
        await createCanvasPreset(projectId, { title, text });
        toast.success("已新建预设");
      }
      await reload();
      closeEditor();
      setTab("canvas");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "保存失败");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("确定删除这条预设词？")) return;
    try {
      await deleteCanvasPreset(projectId, id);
      await reload();
      toast.success("已删除");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  function exportJson() {
    const list = tab === "global" ? globalPresets : canvasPresets;
    const blob = new Blob([exportPromptPresetsJson(list)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      tab === "global"
        ? "joyai-global-prompt-presets.json"
        : "joyai-canvas-prompt-presets.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(async (raw) => {
        try {
          const items = parseImportPayload(JSON.parse(raw) as unknown);
          const { count } = await importCanvasPresets(projectId, items);
          await reload();
          setTab("canvas");
          toast.success(`已导入 ${count} 条到本画布`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "导入失败");
        }
      });
    };
    input.click();
  }

  async function migrateLocal() {
    const local = listLocalPromptPresets();
    if (!local.length) {
      clearLocalPromptPresets();
      setShowMigrate(false);
      return;
    }
    try {
      const { count } = await importCanvasPresets(
        projectId,
        local.map((p) => ({ title: p.title, text: p.text })),
      );
      clearLocalPromptPresets();
      setShowMigrate(false);
      await reload();
      setTab("canvas");
      toast.success(`已导入本机 ${count} 条预设到本画布`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "导入本机预设失败");
    }
  }

  const presets = tab === "global" ? globalPresets : canvasPresets;
  const canSave = Boolean(text.trim());
  const canEdit = tab === "canvas";

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={10}
          className="joy-node-gen-preset-pop"
          data-canvas-shortcuts-ignore
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="joy-node-gen-preset-pop-head">
            <div>
              <h2 className="joy-node-gen-preset-pop-title">预设提示词</h2>
              <p className="joy-node-gen-preset-pop-desc">
                全局由运营配置；本画布可自由增删改
              </p>
            </div>
            <div className="joy-node-gen-preset-pop-tools">
              {canEdit ? (
                <button
                  type="button"
                  className="joy-node-gen-icon-btn"
                  title="导入到本画布"
                  aria-label="导入预设"
                  onClick={importJson}
                >
                  <Upload className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                className="joy-node-gen-icon-btn"
                title="导出"
                aria-label="导出预设"
                disabled={!presets.length}
                onClick={exportJson}
              >
                <Download className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="joy-node-gen-preset-tabs">
            <button
              type="button"
              className={cn(
                "joy-node-gen-preset-tab",
                tab === "global" && "is-active",
              )}
              onClick={() => setTab("global")}
            >
              全局
            </button>
            <button
              type="button"
              className={cn(
                "joy-node-gen-preset-tab",
                tab === "canvas" && "is-active",
              )}
              onClick={() => setTab("canvas")}
            >
              本画布
            </button>
          </div>

          {showMigrate && canEdit ? (
            <div className="joy-node-gen-preset-migrate">
              <span>检测到本机旧预设</span>
              <button type="button" onClick={() => void migrateLocal()}>
                导入到本画布
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="joy-node-gen-preset-empty">
              <p>加载中…</p>
            </div>
          ) : presets.length === 0 ? (
            <div className="joy-node-gen-preset-empty">
              <p>
                {tab === "global" ? "暂无全局预设" : "还没有本画布预设"}
              </p>
              <p className="joy-node-gen-preset-empty-hint">
                {tab === "global"
                  ? "由后台「提示词库」配置后会出现在这里"
                  : "把常用的提示词保存起来，下次点一下就能填入"}
              </p>
            </div>
          ) : (
            <ul className="joy-node-gen-preset-list">
              {presets.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="joy-node-gen-preset-row"
                    title="填入提示词"
                    onClick={() => {
                      onApply(item.text);
                      onOpenChange(false);
                    }}
                  >
                    <span className="joy-node-gen-preset-row-title">
                      {item.title}
                    </span>
                    <span className="joy-node-gen-preset-row-text">
                      {item.text}
                    </span>
                  </button>
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="joy-node-gen-preset-row-del"
                        title="编辑"
                        aria-label="编辑预设"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="joy-node-gen-preset-row-del"
                        title="删除"
                        aria-label="删除预设"
                        onClick={() => void remove(item.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canEdit ? (
            <button
              type="button"
              className={cn("joy-node-gen-preset-create")}
              onClick={openCreate}
            >
              <Plus className="size-3.5" />
              新建预设
            </button>
          ) : null}
        </PopoverContent>
      </Popover>

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(next) => {
          if (!next) closeEditor();
        }}
      >
        <DialogContent
          className="joy-preset-dialog"
          data-canvas-shortcuts-ignore
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {editor?.mode === "edit" ? "编辑预设" : "新建预设"}
            </DialogTitle>
          </DialogHeader>

          <div className="joy-preset-dialog-body">
            <div className="joy-preset-dialog-field">
              <div className="joy-preset-dialog-label-row">
                <label htmlFor="joy-preset-name">名称</label>
                <span className="joy-preset-dialog-count">
                  {title.length}/{PROMPT_PRESET_TITLE_MAX}
                </span>
              </div>
              <Input
                id="joy-preset-name"
                value={title}
                onChange={(e) =>
                  setTitle(e.target.value.slice(0, PROMPT_PRESET_TITLE_MAX))
                }
                placeholder="给这条预设起个好记的名字"
                maxLength={PROMPT_PRESET_TITLE_MAX}
                className="joy-preset-dialog-input"
              />
            </div>

            <div className="joy-preset-dialog-field">
              <div className="joy-preset-dialog-label-row">
                <label htmlFor="joy-preset-text">提示词内容</label>
                <span className="joy-preset-dialog-count">
                  {text.length}/{PROMPT_PRESET_TEXT_MAX}
                </span>
              </div>
              <Textarea
                id="joy-preset-text"
                value={text}
                onChange={(e) =>
                  setText(e.target.value.slice(0, PROMPT_PRESET_TEXT_MAX))
                }
                placeholder="填入常用的提示词内容"
                maxLength={PROMPT_PRESET_TEXT_MAX}
                rows={8}
                className="joy-preset-dialog-textarea"
              />
            </div>
          </div>

          <DialogFooter className="joy-preset-dialog-footer">
            <button
              type="button"
              className="joy-preset-dialog-cancel"
              onClick={closeEditor}
            >
              取消
            </button>
            <button
              type="button"
              className="joy-preset-dialog-save"
              disabled={!canSave}
              onClick={() => void saveEditor()}
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
