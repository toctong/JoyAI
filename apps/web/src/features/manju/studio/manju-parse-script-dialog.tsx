"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

export type ManjuAnalyzeMode = "incremental" | "full_add" | "clear_reparse";

const OPTIONS: {
  id: ManjuAnalyzeMode;
  title: string;
  description: string;
  recommended?: boolean;
  danger?: boolean;
}[] = [
  {
    id: "incremental",
    title: "增量新增",
    recommended: true,
    description:
      "保留现有角色、场景、道具资产，自动匹配已有数据，仅新增本次识别出的新内容。",
  },
  {
    id: "full_add",
    title: "全量新增",
    description:
      "保留现有角色、场景、道具资产，并将本次解析结果全部作为新数据添加，可能会产生重复内容。",
  },
  {
    id: "clear_reparse",
    title: "清空并重新解析",
    danger: true,
    description:
      "清空角色资产、场景资产、道具资产中的全部内容，再基于当前剧本重新解析；剧集管理中已生成的视频不受影响。",
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectTitle: string;
  busy?: boolean;
  onConfirm: (mode: ManjuAnalyzeMode) => void | Promise<void>;
};

/** 解析剧本：选择资产合并方式后提交 analyze_assets */
export function ManjuParseScriptDialog({
  open,
  onOpenChange,
  projectTitle,
  busy = false,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<ManjuAnalyzeMode>("incremental");

  const handleConfirm = async () => {
    await onConfirm(mode);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (next) setMode("incremental");
      }}
    >
      <DialogContent className="manju-parse-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="truncate">
              解析剧本
              {projectTitle.trim() ? ` - ${projectTitle.trim()}` : ""}
            </span>
          </DialogTitle>
          <DialogDescription>
            将基于当前剧本内容重新识别角色、场景和道具，请选择本次解析的处理方式。
          </DialogDescription>
        </DialogHeader>

        <div className="manju-parse-dialog__options" role="radiogroup">
          {OPTIONS.map((opt) => {
            const on = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy}
                className={cn(
                  "manju-parse-dialog__option",
                  on && "is-on",
                  opt.danger && "is-danger",
                )}
                onClick={() => setMode(opt.id)}
              >
                <span
                  className={cn(
                    "manju-parse-dialog__radio",
                    on && "is-on",
                  )}
                  aria-hidden
                />
                <span className="manju-parse-dialog__body">
                  <span className="manju-parse-dialog__title-row">
                    <strong>{opt.title}</strong>
                    {opt.recommended ? (
                      <span className="manju-parse-dialog__badge">推荐</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "manju-parse-dialog__desc",
                      opt.danger && "is-danger",
                    )}
                  >
                    {opt.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button type="button" disabled={busy} onClick={() => void handleConfirm()}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {busy ? "解析中…" : "开始解析"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
