"use client";

import { useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
  useCanvasStore,
} from "../store";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

export function TextNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [hovered, setHovered] = useState(false);
  const text = String(node.data.text ?? "");
  const title = nodeTitleLabel("text", node.data);

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
        width: node.width ?? 240,
        minHeight: node.height ?? 80,
      }}
    >
      <NodeTitleChip label={title} visible={selected || hovered} />
      <div className="rounded-md bg-card/95 p-3">
        <textarea
          className="h-full w-full resize-none bg-transparent text-sm outline-none"
          value={text}
          onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}
