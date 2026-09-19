"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CanvasEdge, CanvasNode } from "@joyai/shared";
import { cn } from "@/shared/lib/utils";
import { nodeBox } from "./lib/node-box";
import type { CanvasEdgeVisibility } from "./lib/canvas-prefs";

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
  selectedNodeIds?: string[];
  edgeVisibility?: CanvasEdgeVisibility;
  draft?: { sourceId: string; x: number; y: number } | null;
  onSelectEdge: (id: string | null) => void;
  onCutEdge: (id: string) => void;
};

export function CanvasEdges({
  nodes,
  edges,
  selectedEdgeId,
  selectedNodeIds = [],
  edgeVisibility = "all",
  draft,
  onSelectEdge,
  onCutEdge,
}: Props) {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const focusIds = new Set(selectedNodeIds);
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

  const visibleEdges =
    edgeVisibility === "focus"
      ? focusIds.size
        ? edges.filter(
            (edge) => focusIds.has(edge.source) || focusIds.has(edge.target),
          )
        : []
      : edges;

  return (
    <svg
      className="pointer-events-none absolute z-[1] overflow-visible text-foreground/40"
      style={{ left, top, width, height }}
    >
      <g transform={`translate(${-left} ${-top})`}>
        {visibleEdges.map((edge) => {
          const source = byId.get(edge.source);
          const target = byId.get(edge.target);
          if (!source || !target) return null;
          const a = nodeCenterRight(source);
          const b = nodeCenterLeft(target);
          const selected = selectedEdgeId === edge.id;
          const hovered = hoveredEdgeId === edge.id;
          const related =
            focusIds.has(edge.source) || focusIds.has(edge.target);
          const active = selected || hovered || related;
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
                strokeWidth={selected ? 2.6 : active ? 2.15 : 1.7}
                strokeLinecap="round"
                className={cn(
                  "pointer-events-none transition-[stroke-width,opacity] duration-200",
                  active ? "text-foreground/80" : "text-foreground/35",
                  (selected || related) && "joy-canvas-edge-flow text-primary",
                  hovered && !selected && "text-primary/80",
                )}
              />
              {selected || hovered ? (
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
                  className="joy-canvas-edge-flow text-primary"
                  strokeWidth={2}
                  strokeLinecap="round"
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
  visible: boolean;
  onConnectStart: (nodeId: string, e: React.PointerEvent) => void;
};

/** Ports only show when the node is selected or hovered. */
const PORT_GAP = 6;

export function NodeHandles({
  node,
  visible,
  onConnectStart,
}: HandleProps) {
  const box = nodeBox(node);
  const portClass = cn(
    "joy-canvas-port absolute z-[2] grid size-5 -translate-y-1/2 place-items-center rounded-full border border-foreground/75 bg-background text-foreground shadow-sm",
    visible && "is-visible",
  );

  return (
    <>
      <span
        title="输入"
        aria-hidden
        className={cn(portClass, "-translate-x-[calc(100%+6px)]")}
        style={{ left: node.x, top: node.y + box.height / 2 }}
      >
        <Plus className="size-3" strokeWidth={2.25} />
      </span>
      <button
        type="button"
        title="输出 · 拖到目标节点或空白处"
        aria-label="输出连接点"
        tabIndex={visible ? 0 : -1}
        className={cn(portClass, "hover:scale-110")}
        style={{
          left: node.x + box.width + PORT_GAP,
          top: node.y + box.height / 2,
        }}
        onPointerDown={(e) => {
          if (!visible) return;
          e.stopPropagation();
          onConnectStart(node.id, e);
        }}
      >
        <Plus className="size-3" strokeWidth={2.25} />
      </button>
    </>
  );
}
