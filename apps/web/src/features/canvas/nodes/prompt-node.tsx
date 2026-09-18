"use client";

import { useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import type { CanvasNode } from "@joyai/shared";
import { Loader2 } from "lucide-react";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { nodeChromeClass } from "../lib/node-chrome";
import { CanvasIconSparkles } from "../icons/canvas-icons";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import {
  AiPromptEditor,
  getGeneratePayload,
  mentionExpandText,
  type PromptGeneratePayload,
} from "@/features/ai-prompt";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

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

  const mentionItems = useMemo(() => {
    return nodes
      .filter((n) => n.type === "image")
      .map((n, i) => {
        const url = String(n.data.url ?? n.data.src ?? "");
        const assetId = String(n.data.assetId ?? "");
        const index1 = i + 1;
        return {
          id: assetId || n.id,
          label: `@图片${index1}`,
          url,
          mediaKind: "image" as const,
          expandText: mentionExpandText("image", index1),
        };
      })
      .filter((m) => m.url && !m.url.startsWith("data:"));
  }, [nodes]);

  function syncRefs(payload: PromptGeneratePayload, plain?: string) {
    const nodeIds = nodes
      .filter((n) => n.type === "image")
      .filter((n) => {
        const aid = String(n.data.assetId ?? "");
        const url = String(n.data.url ?? "");
        return (
          (aid && payload.assetIds.includes(aid)) ||
          payload.assetIds.includes(n.id) ||
          (url && payload.imageUrls.includes(url))
        );
      })
      .map((n) => n.id);
    updateNodeData(node.id, {
      ...(plain !== undefined ? { prompt: plain } : {}),
      referenceIds: [...new Set([...payload.assetIds, ...nodeIds])],
      referenceUrls: payload.imageUrls,
    });
  }

  async function submit() {
    const payload = getGeneratePayload(editorRef.current);
    const promptText = payload.prompt.trim() || prompt.trim();
    if (!projectId || !promptText) return;
    const operation = String(node.data.operation ?? "generate");
    const edges = useCanvasStore.getState().edges;
    const incoming = edges
      .filter((e) => e.target === node.id)
      .map((e) => nodes.find((n) => n.id === e.source))
      .filter((n): n is CanvasNode => n != null && n.type === "image");
    const edgeAssetIds = incoming
      .map((n) => String(n.data.assetId ?? ""))
      .filter(Boolean);
    const edgeUrls = incoming
      .map((n) => String(n.data.url ?? ""))
      .filter((u) => u && !u.startsWith("data:"));
    const referenceAssetIds = [
      ...new Set([...payload.assetIds, ...edgeAssetIds]),
    ];
    const referenceUrls = [
      ...new Set([...payload.imageUrls, ...edgeUrls]),
    ];
    setBusy(true);
    updateNodeData(node.id, {
      status: "queued",
      prompt: promptText,
      error: "",
      referenceIds: referenceAssetIds,
      referenceUrls,
    });
    try {
      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: "image",
          input: {
            prompt: promptText,
            n: 1,
            canvasProjectId: projectId,
            canvasNodeId: node.id,
            referenceAssetIds,
            referenceUrls,
            operation,
          },
        },
      });
      updateNodeData(node.id, { status: "running", jobId: job.id });
    } catch (e) {
      updateNodeData(node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : "失败",
      });
    } finally {
      setBusy(false);
    }
  }

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
        width: node.width ?? 300,
      }}
    >
      <div className="overflow-hidden rounded-md border border-border bg-card/95 p-3 shadow-lg">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <CanvasIconSparkles className="size-3.5 text-primary" />
        Prompt
        {String(node.data.operation ?? "generate") !== "generate" ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {String(node.data.operation)}
          </span>
        ) : null}
      </div>
      <div onPointerDown={(e) => e.stopPropagation()}>
        <AiPromptEditor
          editorRef={editorRef}
          initialText={prompt}
          mentionItems={mentionItems}
          placeholder="输入提示词，/ 指令 · @ 引用画布图"
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
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {String(node.data.operation ?? "generate") === "outpaint"
          ? "扩图生成"
          : String(node.data.operation ?? "generate") === "inpaint"
            ? "局部重绘"
            : "生成图像"}
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
