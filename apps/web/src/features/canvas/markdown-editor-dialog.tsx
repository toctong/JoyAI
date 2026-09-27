"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MarkdownEditorPane = dynamic(
  () => import("./markdown-editor-pane").then((m) => m.MarkdownEditorPane),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-muted/50" />
    ),
  },
);

type Props = {
  open: boolean;
  title: string;
  value: string;
  placeholder?: string;
  onOpenChange: (open: boolean) => void;
  onSave: (value: string) => void;
};

export function MarkdownEditorDialog({
  open,
  title,
  value,
  placeholder,
  onOpenChange,
  onSave,
}: Props) {
  const { resolvedTheme } = useTheme();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  function save() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="flex h-[min(88vh,860px)] w-[min(980px,calc(100vw-32px))] max-w-none flex-col gap-3 overflow-hidden p-4 sm:rounded-2xl"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save();
          }
        }}
      >
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            支持标题、列表、代码和表格。工具栏可切换实时预览。Ctrl / ⌘ + Enter
            保存。
          </p>
        </DialogHeader>
        {open ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <MarkdownEditorPane
              value={draft}
              placeholder={placeholder}
              colorMode={resolvedTheme === "dark" ? "dark" : "light"}
              preview="edit"
              onChange={setDraft}
            />
          </div>
        ) : null}
        <DialogFooter className="shrink-0 items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {draft.trim().length} 字
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={save}>
              完成
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
