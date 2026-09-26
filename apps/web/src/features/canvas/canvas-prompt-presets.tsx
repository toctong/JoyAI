"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import {
  createPromptPreset,
  deletePromptPreset,
  exportPromptPresetsJson,
  importPromptPresets,
  listPromptPresets,
  PROMPT_PRESET_TEXT_MAX,
  PROMPT_PRESET_TITLE_MAX,
  updatePromptPreset,
  type PromptPreset,
} from "./lib/prompt-presets";

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; preset: PromptPreset };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill create form from current composer draft. */
  draftText?: string;
  onApply: (text: string) => void;
  children: ReactNode;
};

/**
 * Canvas prompt-preset module: list / create / edit / delete / import / export.
 */
export function CanvasPromptPresets({
  open,
  onOpenChange,
  draftText = "",
  onApply,
  children,
}: Props) {
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");

  function reload() {
    setPresets(listPromptPresets());
  }

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open]);

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

  function saveEditor() {
    try {
      if (editor?.mode === "edit") {
        updatePromptPreset(editor.preset.id, { title, text });
        toast.success("已更新预设");
      } else {
        createPromptPreset({ title, text });
        toast.success("已新建预设");
      }
      reload();
      closeEditor();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    }
  }

  function remove(id: string) {
    if (!window.confirm("确定删除这条预设词？")) return;
    if (!deletePromptPreset(id)) {
      toast.error("删除失败");
      return;
    }
    reload();
    toast.success("已删除");
  }

  function exportJson() {
    const blob = new Blob([exportPromptPresetsJson(presets)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "joyai-prompt-presets.json";
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
      void file.text().then((raw) => {
        try {
          const count = importPromptPresets(JSON.parse(raw) as unknown);
          reload();
          toast.success(`已导入 ${count} 条预设`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "导入失败");
        }
      });
    };
    input.click();
  }

  const canSave = Boolean(text.trim());

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
                增删改查常用提示词，点一下即可填入
              </p>
            </div>
            <div className="joy-node-gen-preset-pop-tools">
              <button
                type="button"
                className="joy-node-gen-icon-btn"
                title="导入"
                aria-label="导入预设"
                onClick={importJson}
              >
                <Upload className="size-3.5" />
              </button>
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

          {presets.length === 0 ? (
            <div className="joy-node-gen-preset-empty">
              <p>还没有预设提示词</p>
              <p className="joy-node-gen-preset-empty-hint">
                把常用的提示词保存起来，下次点一下就能填入
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
                    onClick={() => remove(item.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className={cn("joy-node-gen-preset-create")}
            onClick={openCreate}
          >
            <Plus className="size-3.5" />
            新建预设
          </button>
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
              onClick={saveEditor}
            >
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
