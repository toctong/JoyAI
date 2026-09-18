"use client";

import type { CanvasEdge, CanvasNode } from "@joyai/shared";
import { cn } from "@/shared/lib/utils";

function nodeCenterRight(node: CanvasNode) {
  const w = node.width ?? 240;
  const h = node.height ?? 180;
  return { x: node.x + w, y: node.y + h / 2 };
}

function nodeCenterLeft(node: CanvasNode) {
  const h = node.height ?? 180;
  return { x: node.x, y: node.y + h / 2 };
}

function bezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.45, 40);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

type Props = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEdgeId: string | null;
  draft?: { sourceId: string; x: number; y: number } | null;
  onSelectEdge: (id: string | null) => void;
};

export function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  draft,
  onSelectEdge,
}: Props) {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={1}
      height={1}
    >
      {edges.map((edge) => {
        const source = byId.get(edge.source);
        const target = byId.get(edge.target);
        if (!source || !target) return null;
        const a = nodeCenterRight(source);
        const b = nodeCenterLeft(target);
        const selected = selectedEdgeId === edge.id;
        return (
          <g key={edge.id} className="pointer-events-auto">
            <path
              d={bezierPath(a.x, a.y, b.x, b.y)}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelectEdge(edge.id);
              }}
            />
            <path
              d={bezierPath(a.x, a.y, b.x, b.y)}
              fill="none"
              stroke={
                selected
                  ? "rgba(167,139,250,0.95)"
                  : "rgba(255,255,255,0.28)"
              }
              strokeWidth={selected ? 2.5 : 1.75}
              className={cn("pointer-events-none")}
            />
          </g>
        );
      })}
      {draft
        ? (() => {
            const source = byId.get(draft.sourceId);
            if (!source) return null;
            const a = nodeCenterRight(source);
            return (
              <path
                d={bezierPath(a.x, a.y, draft.x, draft.y)}
                fill="none"
                stroke="rgba(167,139,250,0.7)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            );
          })()
        : null}
    </svg>
  );
}

type HandleProps = {
  node: CanvasNode;
  onConnectStart: (nodeId: string, e: React.PointerEvent) => void;
};

/** Output handle only — drop onto any node body to complete the edge. */
export function NodeHandles({ node, onConnectStart }: HandleProps) {
  const w = node.width ?? 240;
  const h = node.height ?? (node.type === "text" ? 80 : 180);

  return (
    <>
      <span
        title="输入"
        aria-hidden
        className="pointer-events-none absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-violet-400/80"
        style={{ left: node.x, top: node.y + h / 2 }}
      />
      <button
        type="button"
        title="输出 · 拖到目标节点或空白处"
        aria-label="输出连接点"
        className="absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-emerald-400/90 shadow hover:scale-125"
        style={{ left: node.x + w, top: node.y + h / 2 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onConnectStart(node.id, e);
        }}
      />
    </>
  );
}
