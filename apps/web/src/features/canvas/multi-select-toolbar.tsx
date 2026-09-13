"use client";

import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Group,
  Trash2,
  Ungroup,
} from "lucide-react";
import type { CanvasNode } from "@joyai/shared";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import { groupIdOf } from "./lib/align";
import { cn } from "@/shared/lib/utils";

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
};

function ToolBtn({
  title,
  danger,
  disabled,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-white/85 transition hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-35",
        danger && "hover:bg-red-500/20 hover:text-red-300",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden />;
}

export function MultiSelectToolbar({ nodes, viewport }: Props) {
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const alignSelection = useCanvasStore((s) => s.alignSelection);
  const distributeSelection = useCanvasStore((s) => s.distributeSelection);
  const groupSelection = useCanvasStore((s) => s.groupSelection);
  const ungroupSelection = useCanvasStore((s) => s.ungroupSelection);

  if (nodes.length < 2) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const node of nodes) {
    const w = node.width ?? 240;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
  }
  const left = viewport.x + ((minX + maxX) / 2) * viewport.zoom;
  const top = viewport.y + minY * viewport.zoom - 12;

  const hasGroup = nodes.some((n) => groupIdOf(n));
  const canDistribute = nodes.length >= 3;

  function run(action: () => void) {
    pushHistory();
    action();
  }

  return (
    <div
      className="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex max-w-[min(92vw,520px)] flex-wrap items-center justify-center gap-0.5 rounded-xl bg-[#1c1c1ef5] px-1 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-md">
        <span className="px-2 text-[11px] tabular-nums text-white/55">
          {nodes.length}
        </span>
        <Sep />
        <ToolBtn
          title="左对齐"
          onClick={() => run(() => alignSelection("left"))}
        >
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="水平居中"
          onClick={() => run(() => alignSelection("center-x"))}
        >
          <AlignCenterVertical className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="右对齐"
          onClick={() => run(() => alignSelection("right"))}
        >
          <AlignRight className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn
          title="顶对齐"
          onClick={() => run(() => alignSelection("top"))}
        >
          <ArrowUpToLine className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="垂直居中"
          onClick={() => run(() => alignSelection("center-y"))}
        >
          <AlignCenterHorizontal className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="底对齐"
          onClick={() => run(() => alignSelection("bottom"))}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn
          title="水平分布"
          disabled={!canDistribute}
          onClick={() => run(() => distributeSelection("horizontal"))}
        >
          <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="垂直分布"
          disabled={!canDistribute}
          onClick={() => run(() => distributeSelection("vertical"))}
        >
          <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn title="成组" onClick={() => run(() => groupSelection())}>
          <Group className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title="解组"
          disabled={!hasGroup}
          onClick={() => run(() => ungroupSelection())}
        >
          <Ungroup className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn
          title={`复制 ${nodes.length} 个`}
          onClick={() =>
            run(() => duplicateNodes(nodes.map((n) => n.id)))
          }
        >
          <Copy className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn
          title={`删除 ${nodes.length} 个`}
          danger
          onClick={() => run(() => removeNodes(nodes.map((n) => n.id)))}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>
    </div>
  );
}
