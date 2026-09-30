"use client";

import {
  CanvasIconImage,
  CanvasIconLoader,
  CanvasIconPanorama,
  CanvasIconText,
  CanvasIconVideo,
} from "../icons/canvas-icons";
import { Maximize2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIncomingCanvasRefs,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { MarkdownEditorDialog } from "../markdown-editor-dialog";
import { nodeChromeClass } from "../lib/node-chrome";
import { NodeRefBar } from "../node-ref-bar";
import { useSyncNodeHeight } from "../lib/use-sync-node-height";
import { CanvasIconSparkles } from "../icons/canvas-icons";
import { videoRefMode } from "../lib/video-ref-mode";
import { wrapPanoramaPrompt } from "../lib/panorama-prompt";
import {
  applyCameraPrompt,
  parseCameraControl,
} from "../lib/camera-control";
import {
  collectVideoFrameCandidates,
  orderVideoImageRefs,
  resolveVideoFrameSlots,
} from "../lib/video-frame-slots";
import {
  buildCanvasMentionItems,
  collectIncomingMediaFromEdges,
  mergeJobReferences,
  appendTextRefs,
  resolveMentionedNodeIds,
} from "../lib/canvas-media-refs";
import { api } from "@/shared/lib/api";
import { Button } from "@/components/ui/button";
import {
  plainTextToDoc,
  serializeForGenerate,
  type PromptGeneratePayload,
} from "@/features/ai-prompt/serialize";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

type OutputKind = "image" | "video" | "panorama" | "text";

function parseOutputKind(raw: unknown): OutputKind {
  const v = String(raw ?? "image");
  if (v === "video" || v === "panorama" || v === "text") return v;
  return "image";
}

export function PromptNode({ node, onPointerDown }: Props) {
  const projectId = useCanvasStore((s) => s.projectId);
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const incomingRefs = useIncomingCanvasRefs(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [busy, setBusy] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const prompt = String(node.data.prompt ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const outputKind = parseOutputKind(node.data.outputKind);
  const operation = String(node.data.operation ?? "generate");
  const bodyRef = useRef<HTMLDivElement>(null);
  const incomingCount = incomingRefs.length;
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

  const mentionItems = useMemo(() => {
    const live = useCanvasStore.getState();
    const { incoming } = collectIncomingMediaFromEdges(
      live.nodes,
      live.edges,
      node.id,
    );
    return buildCanvasMentionItems(incoming);
    // incomingRefs identity changes only when this node's refs change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingRefs, node.id]);

  function setOutputKind(kind: OutputKind) {
    updateNodeData(node.id, {
      outputKind: kind,
      ...(kind !== "image" ? { operation: "generate" } : {}),
    });
  }

  function syncRefs(payload: PromptGeneratePayload, plain?: string) {
    const live = useCanvasStore.getState();
    const { edgeAssetIds, edgeUrls } = collectIncomingMediaFromEdges(
      live.nodes,
      live.edges,
      node.id,
    );
    const nodeIds = resolveMentionedNodeIds(live.nodes, payload);
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

  function payloadFromText(text: string): PromptGeneratePayload {
    return serializeForGenerate(plainTextToDoc(text, mentionItems));
  }

  function savePrompt(next: string) {
    if (next === prompt) return;
    pushHistory();
    syncRefs(payloadFromText(next), next);
  }

  async function submit() {
    const payload = payloadFromText(prompt);
    const live = useCanvasStore.getState();
    const { edgeAssetIds, edgeUrls, texts } = collectIncomingMediaFromEdges(
      live.nodes,
      live.edges,
      node.id,
    );
    const includeAv = outputKind === "video";
    const { referenceAssetIds, referenceUrls } = mergeJobReferences(
      payload,
      edgeAssetIds,
      edgeUrls,
      includeAv,
    );
    const nodeIds = resolveMentionedNodeIds(live.nodes, payload);
    const promptText = appendTextRefs(
      payload.prompt.trim() || prompt.trim(),
      texts,
    );
    if (!projectId || !promptText) return;
    const cameraControl = parseCameraControl(node.data.cameraControl);
    setBusy(true);
    updateNodeData(node.id, {
      status: "queued",
      prompt: promptText,
      error: "",
      outputKind,
      cameraControl,
      referenceIds: [...new Set([...referenceAssetIds, ...nodeIds])],
      referenceUrls,
    });
    try {
      if (outputKind === "text") {
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "llm",
            input: {
              purpose: "chat",
              prompt: promptText,
              canvasProjectId: projectId,
              canvasNodeId: node.id,
              referenceAssetIds,
              referenceUrls,
            },
          },
        });
        updateNodeData(node.id, { status: "running", jobId: job.id });
      } else if (outputKind === "video") {
        const liveNodes = live.nodes;
        const liveEdges = live.edges;
        const candidates = collectVideoFrameCandidates(
          liveNodes,
          liveEdges,
          node,
        );
        const slots = resolveVideoFrameSlots({
          candidates,
          firstFrameNodeId: String(node.data.firstFrameNodeId ?? ""),
          lastFrameNodeId: String(node.data.lastFrameNodeId ?? ""),
        });
        const ordered = orderVideoImageRefs({
          first: slots.first,
          last: slots.last,
          otherAssetIds: referenceAssetIds,
          otherUrls: referenceUrls,
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: applyCameraPrompt(promptText, cameraControl),
              canvasProjectId: projectId,
              canvasNodeId: node.id,
              referenceAssetIds: ordered.referenceAssetIds,
              referenceUrls: ordered.referenceUrls,
              refMode:
                ordered.refMode ??
                videoRefMode(
                  Math.max(
                    ordered.referenceAssetIds.length,
                    ordered.referenceUrls.length,
                  ),
                ),
            },
          },
        });
        updateNodeData(node.id, { status: "running", jobId: job.id });
      } else {
        const finalPrompt = applyCameraPrompt(
          outputKind === "panorama"
            ? wrapPanoramaPrompt(promptText, {
                hasReference:
                  referenceAssetIds.length > 0 || referenceUrls.length > 0,
              })
            : promptText,
          outputKind === "panorama" ? null : cameraControl,
        );
        const countRaw = Number(node.data.genCount);
        const n = Number.isFinite(countRaw)
          ? Math.min(4, Math.max(1, Math.floor(countRaw)))
          : 1;
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: finalPrompt,
              n,
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
            ? "生成环视"
            : outputKind === "text"
              ? "生成文本"
              : "生成图像";

  return (
    <>
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
        className="overflow-hidden rounded-xl border border-border/70 bg-card/90 p-3"
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
              { id: "panorama" as const, label: "环视", Icon: CanvasIconPanorama },
              { id: "video" as const, label: "视频", Icon: CanvasIconVideo },
              { id: "text" as const, label: "文本", Icon: CanvasIconText },
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
          className="group relative mb-2 min-h-[72px] cursor-text rounded-lg bg-muted/40 px-2.5 py-2"
          data-canvas-no-zoom
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            setEditorOpen(true);
          }}
        >
          <button
            type="button"
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
            title="打开 Markdown 编辑器"
            onClick={() => setEditorOpen(true)}
          >
            <Maximize2 className="size-3.5" />
          </button>
          {prompt.trim() ? (
            <p className="line-clamp-6 whitespace-pre-wrap break-words pr-6 text-sm leading-relaxed">
              {prompt}
            </p>
          ) : (
            <p className="pr-6 text-sm text-muted-foreground">
              双击编写提示词，支持 Markdown
            </p>
          )}
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
    <MarkdownEditorDialog
      open={editorOpen}
      title="编辑提示词"
      value={prompt}
      placeholder="描述画面。可用 Markdown，@ 引用画布上的图片。"
      onOpenChange={setEditorOpen}
      onSave={savePrompt}
    />
    </>
  );
}
