"use client";

import {
  CanvasIconDirector,
  CanvasIconImage,
  CanvasIconLoader,
  CanvasIconPanorama,
} from "../icons/canvas-icons";
import { useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { nodeChromeClass } from "../lib/node-chrome";
import { NodeRefBar } from "../node-ref-bar";
import { useSyncNodeHeight } from "../lib/use-sync-node-height";
import { CanvasIconSparkles } from "../icons/canvas-icons";
import { videoRefMode } from "../lib/video-ref-mode";
import { wrapPanoramaPrompt } from "../lib/panorama-prompt";
import {
  buildCanvasMentionItems,
  collectIncomingMediaFromEdges,
  mergeJobReferences,
  resolveMentionedNodeIds,
} from "../lib/canvas-media-refs";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import {
  AiPromptEditor,
  getGeneratePayload,
  type PromptGeneratePayload,
} from "@/features/ai-prompt";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

type OutputKind = "image" | "video" | "panorama";

function parseOutputKind(raw: unknown): OutputKind {
  const v = String(raw ?? "image");
  if (v === "video" || v === "panorama") return v;
  return "image";
}

export function PromptNode({ node, onPointerDown }: Props) {
  const projectId = useCanvasStore((s) => s.projectId);
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const nodes = useCanvasStore((s) => s.nodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const prompt = String(node.data.prompt ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const outputKind = parseOutputKind(node.data.outputKind);
  const operation = String(node.data.operation ?? "generate");
  const bodyRef = useRef<HTMLDivElement>(null);
  const incomingCount = useCanvasStore(
    (s) => s.edges.filter((edge) => edge.target === node.id).length,
  );
  useSyncNodeHeight(node.id, bodyRef, [
    prompt,
    status,
    error,
    outputKind,
    operation,
    node.width,
    incomingCount,
    busy,
  ]);

  const mentionItems = useMemo(
    () => buildCanvasMentionItems(nodes),
    [nodes],
  );

  function setOutputKind(kind: OutputKind) {
    updateNodeData(node.id, {
      outputKind: kind,
      ...(kind !== "image" ? { operation: "generate" } : {}),
    });
  }

  function syncRefs(payload: PromptGeneratePayload, plain?: string) {
    const edges = useCanvasStore.getState().edges;
    const { edgeAssetIds, edgeUrls } = collectIncomingMediaFromEdges(
      nodes,
      edges,
      node.id,
    );
    const nodeIds = resolveMentionedNodeIds(nodes, payload);
    const includeAv = outputKind === "video";
    const { referenceAssetIds, referenceUrls } = mergeJobReferences(
      payload,
      edgeAssetIds,
      edgeUrls,
      includeAv,
    );
    updateNodeData(node.id, {
      ...(plain !== undefined ? { prompt: plain } : {}),
      referenceIds: [...new Set([...referenceAssetIds, ...nodeIds])],
      referenceUrls,
    });
  }

  async function submit() {
    const payload = getGeneratePayload(editorRef.current);
    const promptText = payload.prompt.trim() || prompt.trim();
    if (!projectId || !promptText) return;
    const edges = useCanvasStore.getState().edges;
    const { edgeAssetIds, edgeUrls } = collectIncomingMediaFromEdges(
      nodes,
      edges,
      node.id,
    );
    const includeAv = outputKind === "video";
    const { referenceAssetIds, referenceUrls } = mergeJobReferences(
      payload,
      edgeAssetIds,
      edgeUrls,
      includeAv,
    );
    const nodeIds = resolveMentionedNodeIds(nodes, payload);
    setBusy(true);
    updateNodeData(node.id, {
      status: "queued",
      prompt: promptText,
      error: "",
      outputKind,
      referenceIds: [...new Set([...referenceAssetIds, ...nodeIds])],
      referenceUrls,
    });
    try {
      if (outputKind === "video") {
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: promptText,
              canvasProjectId: projectId,
              canvasNodeId: node.id,
              referenceAssetIds,
              referenceUrls,
              refMode: videoRefMode(
                Math.max(referenceAssetIds.length, referenceUrls.length),
              ),
            },
          },
        });
        updateNodeData(node.id, { status: "running", jobId: job.id });
      } else {
        const finalPrompt =
          outputKind === "panorama"
            ? wrapPanoramaPrompt(promptText, {
                hasReference: referenceAssetIds.length > 0 || referenceUrls.length > 0,
              })
            : promptText;
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: finalPrompt,
              n: 1,
              ratio: outputKind === "panorama" ? "2:1" : undefined,
              canvasProjectId: projectId,
              canvasNodeId: node.id,
              referenceAssetIds,
              referenceUrls,
              operation,
            },
          },
        });
        updateNodeData(node.id, { status: "running", jobId: job.id });
      }
    } catch (e) {
      updateNodeData(node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : "失败",
      });
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    operation === "outpaint"
      ? "扩图生成"
      : operation === "inpaint"
        ? "局部重绘"
        : outputKind === "video"
          ? "生成视频"
          : outputKind === "panorama"
            ? "生成全景"
            : "生成图像";

  return (
    <div
      onPointerDown={onPointerDown}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        nodeChromeClass({ selected, highlighted, pulsing }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 280,
      }}
    >
      <div
        ref={bodyRef}
        className="overflow-hidden rounded-md border border-border bg-card/95 p-3 shadow-lg"
      >
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <CanvasIconSparkles className="size-3.5 text-primary" />
          Prompt
          {operation !== "generate" ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {operation}
            </span>
          ) : null}
        </div>
        <NodeRefBar nodeId={node.id} />
        <div
          className="mb-2 flex gap-1"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(
            [
              { id: "image" as const, label: "图像", Icon: CanvasIconImage },
              { id: "panorama" as const, label: "全景", Icon: CanvasIconPanorama },
              { id: "video" as const, label: "视频", Icon: CanvasIconDirector },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] transition",
                outputKind === id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-muted/50",
              )}
              onClick={() => setOutputKind(id)}
            >
              <Icon className="size-3" />
              {label}
            </button>
          ))}
        </div>
        <div
          data-canvas-no-zoom
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AiPromptEditor
            editorRef={editorRef}
            initialText={prompt}
            mentionItems={mentionItems}
            placeholder="输入提示词，/ 指令 · @ 引用图/视频/音频"
            onPlainChange={(text) => {
              const payload = getGeneratePayload(editorRef.current);
              syncRefs(payload, text);
            }}
            onPayloadChange={(payload) => syncRefs(payload)}
            className="rounded-md border border-border/60 bg-background/60 px-2 py-1"
          />
        </div>
        <Button
          className="mt-2 w-full"
          size="sm"
          disabled={
            busy ||
            status === "running" ||
            status === "queued" ||
            !prompt.trim()
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void submit()}
        >
          {busy || status === "running" || status === "queued" ? (
            <CanvasIconLoader className="h-4 w-4 animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
        <NodeRuntimeBadge
          status={status}
          error={error}
          onRetry={() => void submit()}
          variant="inline"
        />
      </div>
    </div>
  );
}
