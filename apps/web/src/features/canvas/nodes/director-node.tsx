"use client";

import {
  CanvasIconDirector,
} from "../icons/canvas-icons";
import { useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
  onOpenDirector?: (nodeId: string) => void;
};

export function DirectorNode({ node, onPointerDown, onOpenDirector }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        nodeChromeClass({ selected, highlighted, pulsing }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 280,
        height: node.height ?? 180,
      }}
    >
      <NodeTitleChip
        nodeId={node.id}
        label={nodeTitleLabel("director", node.data)}
        customTitle={String(node.data.title ?? "")}
        visible={selected || hovered}
      />
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-card p-3 text-center">
        <CanvasIconDirector className="size-7 text-primary/80" />
        <div className="text-sm font-medium">3D 导演台</div>
        <p className="text-[11px] text-muted-foreground">
          在 3D 空间搭建场景、机位并截图
        </p>
        <p className="text-[10px] text-muted-foreground/80">
          打开即可用，不必先连线
        </p>
        <button
          type="button"
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onOpenDirector?.(node.id)}
        >
          打开导演台
        </button>
      </div>
    </div>
  );
}
