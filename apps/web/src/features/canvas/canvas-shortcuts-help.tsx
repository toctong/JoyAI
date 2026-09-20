"use client";

import {
  CanvasIconClose,
} from "./icons/canvas-icons";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

const ROWS: { keys: string[]; desc: string }[] = [
  { keys: ["Space", "拖动"], desc: "临时切换选中 / 拖动画布" },
  { keys: ["滚轮"], desc: "缩放画布（对准光标）" },
  { keys: ["中键拖动"], desc: "平移画布" },
  { keys: ["拖动空白"], desc: "框选" },
  { keys: ["Shift", "点击"], desc: "加选 / 减选" },
  {
    keys: ["多选绿点"],
    desc: "从选区右侧绿点拖线，批量连到兼容节点或空白新建",
  },
  {
    keys: ["颜色标签"],
    desc: "悬停 / 选中节点标题右侧上色；顶栏色点高亮边框并列出节点，点空白取消",
  },
  { keys: ["Ctrl / Cmd", "A"], desc: "全选" },
  { keys: ["Ctrl / Cmd", "G"], desc: "成组" },
  { keys: ["Ctrl / Cmd", "Shift", "G"], desc: "解组" },
  {
    keys: ["Ctrl / Cmd", "C / V"],
    desc: "复制 / 粘贴节点，或粘贴剪贴板文本 / 图片",
  },
  { keys: ["Ctrl / Cmd", "D"], desc: "复制节点" },
  { keys: ["Ctrl / Cmd", "Z"], desc: "撤销" },
  { keys: ["Ctrl / Cmd", "Shift", "Z"], desc: "重做" },
  { keys: ["方向键"], desc: "微调选中（吸附时按网格，Shift 加倍）" },
  { keys: ["Alt", "拖动"], desc: "单独移动节点，拖入或拖出编组" },
  { keys: ["点击编组标题"], desc: "选中整组；拖动可移动编组" },
  { keys: ["Delete / Backspace"], desc: "删除选中" },
  { keys: ["Esc"], desc: "取消选中并关闭浮层" },
  { keys: ["双击空白"], desc: "添加节点（与右键相同）" },
  { keys: ["右键空白"], desc: "添加节点 / 上传" },
  { keys: ["拖入图片 / 视频"], desc: "上传到画布" },
  { keys: ["0"], desc: "适应全部节点" },
  { keys: ["1"], desc: "适应选中（无选中则适应全部）" },
  { keys: ["?"], desc: "打开 / 关闭快捷键" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CanvasShortcutsHelp({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-black/25" />
        <DialogPrimitive.Content
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[min(86vh,760px)] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg",
            "duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center border-b border-border px-6 py-4 pr-12">
            <DialogTitle className="text-base font-medium">快捷键</DialogTitle>
            <DialogDescription className="sr-only">
              画布操作快捷键列表
            </DialogDescription>
          </div>
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-5 py-4">
            {ROWS.map((row) => (
              <li
                key={`${row.keys.join("+")}-${row.desc}`}
                className="grid grid-cols-[minmax(0,1fr)_11.5rem] items-center gap-6 px-1 py-1.5"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {row.keys.map((key, index) => (
                    <span
                      key={`${key}-${index}`}
                      className="flex items-center gap-1.5"
                    >
                      {index > 0 ? (
                        <span className="text-xs text-muted-foreground/60">
                          +
                        </span>
                      ) : null}
                      <kbd className="inline-flex min-w-9 items-center justify-center rounded-md border border-border bg-background px-2.5 py-1.5 text-center text-xs font-medium leading-none text-foreground shadow-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </span>
                <span className="text-right text-sm text-muted-foreground">
                  {row.desc}
                </span>
              </li>
            ))}
          </ul>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
            <CanvasIconClose className="h-4 w-4" />
            <span className="sr-only">关闭</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
