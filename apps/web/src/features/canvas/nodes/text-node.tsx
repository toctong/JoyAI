"use client";

import { Maximize2 } from "lucide-react";
import { useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
  useCanvasStore,
} from "../store";
import { NodeTitleChip } from "../node-title-chip";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { MarkdownEditorDialog } from "../markdown-editor-dialog";
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
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [hovered, setHovered] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const text = String(node.data.text ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const title = nodeTitleLabel("text", node.data);
  const fontSize = clampFontSize(node.data.fontSize);

  function openEditor() {
    setEditorOpen(true);
  }

  function saveText(next: string) {
    if (next === text) return;
    pushHistory();
    updateNodeData(node.id, { text: next });
  }

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          openEditor();
        }}
        className={cn(
          "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
          nodeChromeClass({ selected, highlighted, pulsing }),
        )}
        style={{
          left: node.x,
          top: node.y,
          width: node.width ?? 360,
          height: node.height ?? 160,
        }}
      >
        <NodeTitleChip
          nodeId={node.id}
          label={title}
          customTitle={String(node.data.title ?? "")}
          visible={selected || hovered}
          onDragPointerDown={onPointerDown}
        />
        <div className="relative flex h-full flex-col overflow-hidden rounded-md border border-border/70 bg-card/80">
          <button
            type="button"
            className="absolute right-1.5 top-1.5 z-[2] grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="打开 Markdown 编辑器"
            data-canvas-no-zoom
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              openEditor();
            }}
          >
            <Maximize2 className="size-3.5" />
          </button>
          <div
            className="min-h-0 flex-1 overflow-hidden px-3 py-2.5 pr-8"
            style={{ fontSize, lineHeight: 1.55 }}
          >
            {text.trim() ? (
              <p className="line-clamp-[8] whitespace-pre-wrap break-words">
                {text}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {status === "queued" || status === "running"
                  ? "正在生成…"
                  : "双击编写 Markdown"}
              </p>
            )}
          </div>
          <NodeRuntimeBadge status={status} error={error} variant="overlay" />
        </div>
      </div>
      <MarkdownEditorDialog
        open={editorOpen}
        title="编辑文本"
        value={text}
        placeholder="写下说明、脚本或提示词…"
        onOpenChange={setEditorOpen}
        onSave={saveText}
      />
    </>
  );
}

function clampFontSize(value: unknown) {
  const size = Number(value);
  if (!Number.isFinite(size)) return 14;
  return Math.min(32, Math.max(10, size));
}
