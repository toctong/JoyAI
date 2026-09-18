"use client";

import { useState } from "react";
import type { CanvasEdge, CanvasNode } from "@joyai/shared";
import { cn } from "@/shared/lib/utils";
import { nodeBox } from "./lib/node-box";

function nodeCenterRight(node: CanvasNode) {
  const box = nodeBox(node);
  return { x: box.x + box.width, y: box.y + box.height / 2 };
}

function nodeCenterLeft(node: CanvasNode) {
  const box = nodeBox(node);
  return { x: box.x, y: box.y + box.height / 2 };
}

function controlDx(x1: number, x2: number) {
  return Math.max(Math.abs(x2 - x1) * 0.45, 40);
}

function bezierPath(x1: number, y1: number, x2: number, y2: number) {
  const dx = controlDx(x1, x2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Midpoint of the same cubic used by `bezierPath` (t = 0.5). */
function bezierMid(x1: number, y1: number, x2: number, y2: number) {
  const dx = controlDx(x1, x2);
  const c1x = x1 + dx;
  const c2x = x2 - dx;
  return {
    x: 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2,
    y: 0.125 * y1 + 0.375 * y1 + 0.375 * y2 + 0.125 * y2,
  };
}

type Props = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedEdgeId: string | null;
  draft?: { sourceId: string; x: number; y: number } | null;
  onSelectEdge: (id: string | null) => void;
  onCutEdge: (id: string) => void;
};

export function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  draft,
  onSelectEdge,
  onCutEdge,
}: Props) {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pad = 2400;
  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 600;
  for (const node of nodes) {
    const box = nodeBox(node);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  const left = minX - pad;
  const top = minY - pad;
  const width = Math.max(1, maxX - minX + pad * 2);
  const height = Math.max(1, maxY - minY + pad * 2);

  return (
    <svg
      className="pointer-events-none absolute overflow-visible text-foreground/45"
      style={{ left, top, width, height }}
    >
      <g transform={`translate(${-left} ${-top})`}>
        {edges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const a = nodeCenterRight(source);
          const b = nodeCenterLeft(target);
          const selected = selectedEdgeId === edge.id;
          const hovered = hoveredEdgeId === edge.id;
          const active = selected || hovered;
          const mid = bezierMid(a.x, a.y, b.x, b.y);
          const d = bezierPath(a.x, a.y, b.x, b.y);
          return (
            <g
              key={edge.id}
              className="pointer-events-auto"
              onPointerEnter={() => setHoveredEdgeId(edge.id)}
              onPointerLeave={() =>
                setHoveredEdgeId((id) => (id === edge.id ? null : id))
              }
            >
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                className="cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectEdge(edge.id);
                }}
              />
              <path
                d={d}
                fill="none"
                stroke="currentColor"
                strokeWidth={selected ? 2.5 : hovered ? 2.1 : 1.75}
                className={cn(
                  "pointer-events-none",
                  (selected || hovered) && "text-primary",
                )}
              />
              {active ? (
                <foreignObject
                  x={mid.x - 14}
                  y={mid.y - 14}
                  width={28}
                  height={28}
                  className="overflow-visible"
                >
                  <button
                    type="button"
                    title="剪断连线"
                    aria-label="剪断连线"
                    className="grid size-7 place-items-center rounded-full border border-border bg-popover text-popover-foreground shadow-md transition hover:bg-destructive/15 hover:text-destructive"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCutEdge(edge.id);
                      setHoveredEdgeId(null);
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block size-3.5 bg-current"
                      style={{
                        WebkitMaskImage: "url(/canvas-icons/scissors.svg)",
                        maskImage: "url(/canvas-icons/scissors.svg)",
                        WebkitMaskSize: "contain",
                        maskSize: "contain",
                        WebkitMaskRepeat: "no-repeat",
                        maskRepeat: "no-repeat",
                        WebkitMaskPosition: "center",
                        maskPosition: "center",
                      }}
                    />
                  </button>
                </foreignObject>
              ) : null}
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
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              );
            })()
          : null}
      </g>
    </svg>
  );
}

type HandleProps = {
  node: CanvasNode;
  onConnectStart: (nodeId: string, e: React.PointerEvent) => void;
};

/** Output handle only — drop onto any node body to complete the edge. */
export function NodeHandles({ node, onConnectStart }: HandleProps) {
  const box = nodeBox(node);

  return (
    <>
      <span
        title="输入"
        aria-hidden
        className="pointer-events-none absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-violet-400/80"
        style={{ left: node.x, top: node.y + box.height / 2 }}
      />
      <button
        type="button"
        title="输出 · 拖到目标节点或空白处"
        aria-label="输出连接点"
        className="absolute z-[2] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-emerald-400/90 shadow hover:scale-125"
        style={{ left: node.x + box.width, top: node.y + box.height / 2 }}
        onPointerDown={(e) => {
          e.stopPropagation();
          onConnectStart(node.id, e);
        }}
      />
    </>
  );
}
