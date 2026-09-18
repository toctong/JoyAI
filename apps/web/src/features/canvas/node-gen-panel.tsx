"use client";

import {
  CanvasIconDirector,
  CanvasIconImage,
  CanvasIconLoader,
} from "./icons/canvas-icons";
import { useMemo, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import { api } from "@/shared/lib/api";
import { videoRefMode } from "./lib/video-ref-mode";
import { wrapPanoramaPrompt } from "./lib/panorama-prompt";
import { collectIncomingMediaFromEdges } from "./lib/canvas-media-refs";
import { nodeBox } from "./lib/node-box";
import { NodeRefBar } from "./node-ref-bar";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  viewport: Viewport;
};

function panelAnchor(node: CanvasNode, viewport: Viewport) {
  const box = nodeBox(node);
  const left = viewport.x + (box.x + box.width / 2) * viewport.zoom;
  const top = viewport.y + (box.y + box.height) * viewport.zoom + 14;
  return { left, top };
}

/**
 * Below-node quick generate panel (image/video).
 * Reference: infinite-canvas node prompt panel — rewritten for JoyAI jobs.
 */
export function NodeGenPanel({ node, viewport }: Props) {
  const projectId = useCanvasStore((s) => s.projectId);
  const edges = useCanvasStore((s) => s.edges);
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"image" | "video">(
    node.type === "video" ? "video" : "image",
  );
  const panorama = node.type === "panorama";
  const output: "image" | "video" = panorama ? "image" : kind;

  const { left, top } = useMemo(
    () => panelAnchor(node, viewport),
    [node, viewport],
  );

  const url = String(node.data.url ?? "");
  const hasMedia = Boolean(url) && !url.startsWith("data:");
  const status = String(node.data.status ?? "idle");
  const running = status === "queued" || status === "running" || busy;

  const edgeRefs = useMemo(
    () => collectIncomingMediaFromEdges(nodes, edges, node.id),
    [edges, node.id, nodes],
  );

  async function submit() {
    const text = prompt.trim();
    if (!projectId || !text || running) return;

    const assetId = String(node.data.assetId ?? "");
    const referenceAssetIds = [
      ...new Set([
        ...(assetId ? [assetId] : []),
        ...edgeRefs.edgeAssetIds,
      ]),
    ];
    const referenceUrls = [
      ...new Set([
        ...(hasMedia ? [url] : []),
        ...edgeRefs.edgeUrls,
      ]),
    ].filter((item) => item && !item.startsWith("data:"));

    setBusy(true);
    pushHistory();
    let targetId = node.id;
    let createdTarget = false;

    try {
      if (output === "image") {
        const reuseEmpty =
          (node.type === "image" || node.type === "panorama") && !hasMedia;
        if (!reuseEmpty) {
          targetId = addNode(panorama ? "panorama" : "image", {
            x: node.x + (node.width ?? 240) + 40,
            y: node.y,
          });
          addEdge(node.id, targetId);
          createdTarget = true;
        }
        const promptText = panorama
          ? wrapPanoramaPrompt(text, { hasReference: hasMedia })
          : text;
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "image",
            input: {
              prompt: promptText,
              n: 1,
              ratio: panorama ? "2:1" : undefined,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
              operation: "generate",
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
      } else {
        if (node.type !== "video" || hasMedia) {
          targetId = addNode("video", {
            x: node.x + (node.width ?? 240) + 40,
            y: node.y,
          });
          addEdge(node.id, targetId);
          createdTarget = true;
        }
        updateNodeData(targetId, {
          status: "queued",
          error: "",
          prompt: text,
        });
        const job = await api<{ id: string }>("/jobs", {
          method: "POST",
          body: {
            kind: "video",
            input: {
              prompt: text,
              canvasProjectId: projectId,
              canvasNodeId: targetId,
              referenceAssetIds,
              referenceUrls,
              refMode: videoRefMode(
                Math.max(referenceAssetIds.length, referenceUrls.length),
              ),
            },
          },
        });
        updateNodeData(targetId, { status: "running", jobId: job.id });
      }
      setPrompt("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "提交失败";
      if (createdTarget && targetId !== node.id) {
        removeNodes([targetId]);
      } else {
        updateNodeData(targetId, { status: "failed", error: message });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute z-30 w-[min(320px,calc(100vw-24px))] -translate-x-1/2 rounded-xl p-2.5"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex gap-1">
        {panorama ? (
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary/15 px-2 py-1.5 text-xs text-primary">
            <CanvasIconImage className="size-3.5" />
            全景 2:1
          </div>
        ) : (
          <>
            <button
              type="button"
              className={cn(
                "joy-canvas-chrome-btn flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs",
                kind === "image" && "bg-primary/15 text-primary",
              )}
              onClick={() => setKind("image")}
            >
              <CanvasIconImage className="size-3.5" />
              生图
            </button>
            <button
              type="button"
              className={cn(
                "joy-canvas-chrome-btn flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs",
                kind === "video" && "bg-primary/15 text-primary",
              )}
              onClick={() => setKind("video")}
            >
              <CanvasIconDirector className="size-3.5" />
              生视频
            </button>
          </>
        )}
      </div>
      <NodeRefBar nodeId={node.id} />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder={
          panorama
            ? "描述全景场景，将按 2:1 等距圆柱生成"
            : hasMedia
              ? kind === "video"
                ? "描述运动与镜头…（将用当前媒体作参考）"
                : "描述画面…（将用当前媒体作参考）"
              : kind === "video"
                ? "描述要生成的视频…"
                : "描述要生成的图像…"
        }
        className="w-full resize-none rounded-lg border border-border/60 bg-background/80 px-2.5 py-2 text-sm outline-none focus:border-primary/50"
      />
      <Button
        size="sm"
        className="mt-2 w-full"
        disabled={running || !prompt.trim()}
        onClick={() => void submit()}
      >
        {running ? <CanvasIconLoader className="size-4 animate-spin" /> : null}
        {panorama ? "生成全景" : kind === "video" ? "生成视频" : "生成图像"}
      </Button>
    </div>
  );
}
