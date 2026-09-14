"use client";

import { Keyboard } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const ROWS: { keys: string; desc: string }[] = [
  { keys: "Space / 中键", desc: "平移画布" },
  { keys: "滚轮", desc: "缩放" },
  { keys: "⌘ / Ctrl + −", desc: "缩小" },
  { keys: "⌘ / Ctrl + =", desc: "放大" },
  { keys: "0", desc: "适应内容" },
  { keys: "拖拽空白", desc: "框选" },
  { keys: "Shift + 点击", desc: "加选 / 减选" },
  { keys: "⌘ / Ctrl + A", desc: "全选" },
  { keys: "⌘ / Ctrl + Z", desc: "撤销" },
  { keys: "⇧⌘Z / Ctrl+Y", desc: "重做" },
  { keys: "⌘ / Ctrl + D", desc: "复制节点" },
  { keys: "Delete", desc: "删除选中" },
  { keys: "拖出绿色点", desc: "连线到另一节点" },
  { keys: "选中边 + Delete", desc: "删除连线" },
  { keys: "绿点拖到节点", desc: "创建连线" },
  { keys: "选中连线 + Delete", desc: "删除连线" },
  { keys: "多选工具条", desc: "对齐 / 分布 / 成组" },
  { keys: "磁铁按钮", desc: "网格吸附开关" },
  { keys: "?", desc: "打开/关闭本面板" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CanvasShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="pointer-events-auto absolute bottom-20 right-3.5 z-30 w-[260px] overflow-hidden rounded-xl bg-[#141416f5] shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 border-b border-white/8 px-3 py-2.5">
        <Keyboard className="h-4 w-4 text-white/70" />
        <span className="text-sm font-medium text-white/90">快捷键</span>
        <button
          type="button"
          className="ml-auto text-xs text-white/45 hover:text-white/80"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      <ScrollArea className="h-[320px]" type="hover">
        <ul className="space-y-1 px-3 py-2">
          {ROWS.map((row) => (
            <li
              key={row.keys}
              className="flex items-baseline justify-between gap-3 py-1 text-xs"
            >
              <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-white/75">
                {row.keys}
              </span>
              <span className={cn("text-right text-white/50")}>{row.desc}</span>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
