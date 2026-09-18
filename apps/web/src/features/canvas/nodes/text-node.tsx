"use client";

import { useRef, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
  useCanvasStore,
} from "../store";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { useSyncNodeHeight } from "../lib/use-sync-node-height";
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
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [hovered, setHovered] = useState(false);
  const text = String(node.data.text ?? "");
  const title = nodeTitleLabel("text", node.data);
  const fontSize = clampFontSize(node.data.fontSize);
  const bodyRef = useRef<HTMLDivElement>(null);
  const historyPushed = useRef(false);
  useSyncNodeHeight(node.id, bodyRef, [text, fontSize, node.width]);

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
      <NodeTitleChip
        nodeId={node.id}
        label={title}
        customTitle={String(node.data.title ?? "")}
        visible={selected || hovered}
      />
      <div ref={bodyRef} className="rounded-md bg-card/95 p-3">
        <textarea
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className="w-full resize-none bg-transparent outline-none"
          style={{
            fontSize,
            lineHeight: `${Math.round(fontSize * 1.55)}px`,
            minHeight: Math.max(48, Math.round(fontSize * 3.2)),
          }}
          value={text}
          onFocus={() => {
            historyPushed.current = false;
          }}
          onChange={(e) => {
            if (!historyPushed.current) {
              pushHistory();
              historyPushed.current = true;
            }
            updateNodeData(node.id, { text: e.target.value });
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

function clampFontSize(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size)) return 14;
  return Math.min(32, Math.max(10, size));
}
