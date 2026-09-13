"use client";

import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
  useCanvasStore,
} from "../store";
import { nodeChromeClass } from "../lib/node-chrome";
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
  const text = String(node.data.text ?? "");

  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "absolute cursor-grab rounded-md border bg-card/95 p-3 shadow-lg active:cursor-grabbing",
        nodeChromeClass({ selected, highlighted, pulsing }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 240,
        minHeight: node.height ?? 80,
      }}
    >
      <textarea
        className="h-full w-full resize-none bg-transparent text-sm outline-none"
        value={text}
        onChange={(e) => updateNodeData(node.id, { text: e.target.value })}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
