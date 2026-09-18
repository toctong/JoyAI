"use client";

import { useMemo, useRef } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  Copy,
  Download,
  Eraser,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Viewport } from "./store";
import { useCanvasStore } from "./store";
import {
  NODE_REGISTRY,
  type NodeToolbarAction,
} from "./node-registry";
import {
  CanvasIconInpaint,
  CanvasIconOutpaint,
  CanvasIconSparkles,
  CanvasIconUpload,
} from "./icons/canvas-icons";
import { api, apiUpload } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import type { ImageEditOperation } from "@joyai/shared";

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  onEditImage?: (nodeId: string) => void;
};

function ToolBtn({
  title,
  danger,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "joy-canvas-chrome-btn grid size-8 place-items-center rounded-lg transition",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function anchorFor(nodes: CanvasNode[], viewport: Viewport) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const node of nodes) {
    const w = node.width ?? 240;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + w);
  }
  const left = viewport.x + ((minX + maxX) / 2) * viewport.zoom;
  const top = viewport.y + minY * viewport.zoom - 12;
  return { left, top };
}

export function NodeFloatToolbar({ nodes, viewport, onEditImage }: Props) {
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const projectId = useCanvasStore((s) => s.projectId);
  const fileRef = useRef<HTMLInputElement>(null);

  const multi = nodes.length > 1;
  const node = nodes[0];
  const { left, top } = anchorFor(nodes, viewport);

  const actions = useMemo(() => {
    if (multi) return ["duplicate", "delete"] as NodeToolbarAction[];
    return NODE_REGISTRY[node.type].toolbar;
  }, [multi, node]);

  const url = String(node?.data.url ?? "");
  const hasMedia =
    Boolean(url) &&
    !url.startsWith("data:") &&
    (node?.type === "image" || node?.type === "video");
  const status = String(node?.data.status ?? "idle");

  async function onUpload(file: File) {
    if (!node) return;
    pushHistory();
    const asset = await apiUpload<{ id: string; url: string; kind: string }>(
      "/upload",
      file,
    );
    updateNodeData(node.id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
      error: "",
    });
  }

  async function onDownload() {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `joyai-${node.type}-${node.id.slice(0, 6)}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  }

  function spawnPromptBeside(
    seed = "",
    operation: ImageEditOperation = "generate",
  ) {
    if (!node) return;
    pushHistory();
    const w = node.width ?? 240;
    const id = addNode("prompt", {
      x: node.x + w + 40,
      y: node.y,
    });
    const assetId = String(node.data.assetId ?? "");
    const refUrl = String(node.data.url ?? "");
    updateNodeData(id, {
      prompt: seed,
      operation,
      referenceIds: assetId ? [assetId, node.id] : [node.id],
      referenceUrls: refUrl && !refUrl.startsWith("data:") ? [refUrl] : [],
    });
    addEdge(node.id, id);
  }

  async function retryPrompt() {
    if (!node || node.type !== "prompt" || !projectId) return;
    const promptText = String(node.data.prompt ?? "").trim();
    if (!promptText) return;
    updateNodeData(node.id, { status: "queued", error: "" });
    try {
      const edges = useCanvasStore.getState().edges;
      const nodes = useCanvasStore.getState().nodes;
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
      const storedIds = Array.isArray(node.data.referenceIds)
        ? (node.data.referenceIds as string[])
        : [];
      const storedUrls = Array.isArray(node.data.referenceUrls)
        ? (node.data.referenceUrls as string[])
        : [];
      const referenceAssetIds = [...new Set([...storedIds, ...edgeAssetIds])];
      const referenceUrls = [...new Set([...storedUrls, ...edgeUrls])];
      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: "image",
          input: {
            prompt: promptText,
            n: 1,
            canvasProjectId: projectId,
            canvasNodeId: node.id,
            operation: String(node.data.operation ?? "generate"),
            referenceAssetIds,
            referenceUrls,
          },
        },
      });
      updateNodeData(node.id, {
        status: "running",
        jobId: job.id,
        referenceIds: referenceAssetIds,
        referenceUrls,
      });
    } catch (e) {
      updateNodeData(node.id, {
        status: "failed",
        error: e instanceof Error ? e.message : "失败",
      });
    }
  }

  function renderAction(action: NodeToolbarAction) {
    switch (action) {
      case "edit-image":
        if (node.type !== "image" || !url || url.startsWith("data:")) return null;
        return (
          <ToolBtn
            key={action}
            title="编辑"
            onClick={() => onEditImage?.(node.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "upload":
        if (url) return null;
        if (node.type !== "image" && node.type !== "video") return null;
        return (
          <ToolBtn
            key={action}
            title={node.type === "video" ? "上传视频" : "上传图片"}
            onClick={() => fileRef.current?.click()}
          >
            <CanvasIconUpload className="size-3.5" />
          </ToolBtn>
        );
      case "download":
        if (!hasMedia) return null;
        return (
          <ToolBtn key={action} title="下载" onClick={() => void onDownload()}>
            <Download className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "spawn-prompt":
        if (node.type !== "image" || !url) return null;
        return (
          <ToolBtn
            key={action}
            title="旁路生成"
            onClick={() => spawnPromptBeside("基于参考图生成", "generate")}
          >
            <CanvasIconSparkles className="size-3.5" />
          </ToolBtn>
        );
      case "outpaint":
        if (node.type !== "image" || !url || url.startsWith("data:")) return null;
        return (
          <ToolBtn
            key={action}
            title="扩图（旁路 Job）"
            onClick={() =>
              spawnPromptBeside(
                "扩图：保持主体，向四周合理延伸画面",
                "outpaint",
              )
            }
          >
            <CanvasIconOutpaint className="size-3.5" />
          </ToolBtn>
        );
      case "inpaint":
        if (node.type !== "image" || !url || url.startsWith("data:")) return null;
        return (
          <ToolBtn
            key={action}
            title="局部重绘（旁路 Job）"
            onClick={() =>
              spawnPromptBeside(
                "局部重绘：保留构图，按提示修改指定区域",
                "inpaint",
              )
            }
          >
            <CanvasIconInpaint className="size-3.5" />
          </ToolBtn>
        );
      case "text-to-prompt":
        if (node.type !== "text") return null;
        return (
          <ToolBtn
            key={action}
            title="用此文案生图"
            onClick={() =>
              spawnPromptBeside(String(node.data.text ?? "").trim())
            }
          >
            <MessageSquareText className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "clear-prompt":
        if (node.type !== "prompt") return null;
        return (
          <ToolBtn
            key={action}
            title="清空提示词"
            onClick={() => {
              pushHistory();
              updateNodeData(node.id, {
                prompt: "",
                status: "idle",
                error: "",
                jobId: "",
              });
            }}
          >
            <Eraser className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "retry":
        if (node.type !== "prompt") return null;
        if (status !== "failed" && status !== "succeeded") return null;
        if (!String(node.data.prompt ?? "").trim()) return null;
        return (
          <ToolBtn
            key={action}
            title="重试生成"
            onClick={() => void retryPrompt()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "duplicate":
        return (
          <ToolBtn
            key={action}
            title={multi ? `复制 ${nodes.length} 个` : "复制"}
            onClick={() => {
              pushHistory();
              duplicateNodes(nodes.map((n) => n.id));
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "delete":
        return (
          <ToolBtn
            key={action}
            title={multi ? `删除 ${nodes.length} 个` : "删除"}
            danger
            onClick={() => {
              pushHistory();
              removeNodes(nodes.map((n) => n.id));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      default:
        return null;
    }
  }

  const rendered = actions.map(renderAction).filter(Boolean);
  if (!rendered.length) return null;

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        /* keep visible while interacting */
      }}
    >
      <div className="joy-canvas-chrome flex items-center gap-0.5 rounded-xl px-1 py-1">
        {multi ? (
          <span className="joy-canvas-chrome-muted px-2 text-[11px] tabular-nums">
            {nodes.length}
          </span>
        ) : null}
        {rendered}
      </div>

      {!multi && (node.type === "image" || node.type === "video") ? (
        <input
          ref={fileRef}
          type="file"
          accept={node.type === "video" ? "video/*" : "image/*"}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
            e.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}
