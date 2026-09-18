"use client";

import {
  CanvasIconAudio,
  CanvasIconCopy,
  CanvasIconDirector,
  CanvasIconDownload,
  CanvasIconEraser,
  CanvasIconFile,
  CanvasIconFrame,
  CanvasIconGrid,
  CanvasIconImage,
  CanvasIconInfo,
  CanvasIconLock,
  CanvasIconMaximize,
  CanvasIconMessage,
  CanvasIconMore,
  CanvasIconMinus,
  CanvasIconPanelBottom,
  CanvasIconPanorama,
  CanvasIconPencil,
  CanvasIconPlus,
  CanvasIconRetry,
  CanvasIconScissors,
  CanvasIconTrash,
  CanvasIconUnlock,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNode, ImageEditOperation } from "@joyai/shared";
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
import { captureVideoFrame } from "./lib/capture-video-frame";
import { extractAudioFromVideo } from "./lib/extract-audio";
import { videoRefMode } from "./lib/video-ref-mode";
import { getPlaybackTime } from "./lib/playback-clock";
import { wrapPanoramaPrompt, flagPanoramaAspect } from "./lib/panorama-prompt";
import { convertImagePanoramaType } from "./lib/convert-media-type";
import { frameNodeToMedia } from "./lib/fit-node-size";
import {
  collectIncomingMediaFromEdges,
} from "./lib/canvas-media-refs";
import { api, apiUpload } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import type { ImageToolMode } from "./image-tool-dialog";
import {
  copyUpstreamPrompt,
  toggleFreeResize,
} from "./lib/image-node-actions";

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  onEditImage?: (nodeId: string) => void;
  onOpenDirector?: (nodeId: string) => void;
  genPanelOpen?: boolean;
  onToggleGenPanel?: () => void;
  onOpenImageTool?: (mode: ImageToolMode) => void;
  onOpenInfo?: () => void;
  onOpenAudioTrim?: () => void;
  onOpenMask?: () => void;
};

function ToolBtn({
  title,
  label,
  danger,
  onClick,
  children,
}: {
  title: string;
  /** Short visible name next to the icon (reference-style labeled toolbar). */
  label?: string;
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
        "joy-canvas-chrome-btn inline-flex h-8 items-center justify-center rounded-lg transition",
        label ? "gap-1.5 px-2.5" : "size-8",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {children}
      {label ? (
        <span className="whitespace-nowrap text-[12px] font-medium leading-none tracking-wide">
          {label}
        </span>
      ) : null}
    </button>
  );
}

const RASTER_ACTIONS = new Set<NodeToolbarAction>([
  "crop",
  "split",
  "upscale",
  "view-image",
  "copy-prompt",
  "toggle-resize",
]);

/** Shown as their own buttons. Copy / delete are appended after the menus. */
const BAR_ACTIONS = new Set<NodeToolbarAction>([
  "capture-frame",
  "extract-audio",
  "trim-audio",
  "to-image",
  "open-director",
  "text-to-prompt",
  "font-down",
  "font-up",
  "clear-prompt",
  "retry",
  "duplicate",
  "delete",
]);

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

export function NodeFloatToolbar({
  nodes,
  viewport,
  onEditImage,
  onOpenDirector,
  genPanelOpen,
  onToggleGenPanel,
  onOpenImageTool,
  onOpenInfo,
  onOpenAudioTrim,
  onOpenMask,
}: Props) {
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNode = useCanvasStore((s) => s.updateNode);
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

  const mainActions = actions.filter((action) => !RASTER_ACTIONS.has(action));

  const url = String(node?.data.url ?? "");
  const hasMedia =
    Boolean(url) &&
    !url.startsWith("data:") &&
    (node?.type === "image" ||
      node?.type === "video" ||
      node?.type === "panorama" ||
      node?.type === "audio");
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
      ...(node.type === "panorama" ? { projection: "equirectangular" } : {}),
    });
    if (node.type === "panorama") {
      flagPanoramaAspect(asset.url, (aspectHint) =>
        useCanvasStore.getState().updateNodeData(node.id, { aspectHint }),
      );
    } else if (node.type === "image" || node.type === "video") {
      void frameNodeToMedia(node.id, file, node.type);
    }
  }

  async function onDownload() {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const fromMime =
        blob.type === "image/png"
          ? "png"
          : blob.type === "image/jpeg"
            ? "jpg"
            : blob.type === "image/webp"
              ? "webp"
              : blob.type.includes("mp4")
                ? "mp4"
                : blob.type.includes("webm")
                  ? "webm"
                  : blob.type.includes("audio")
                    ? "webm"
                    : "";
      const fromUrl = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1] ?? "";
      const ext =
        fromMime ||
        fromUrl ||
        (node.type === "video"
          ? "mp4"
          : node.type === "audio"
            ? "webm"
            : "png");
      a.download = `joyai-${node.type}-${node.id.slice(0, 6)}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  }

  function spawnPromptBeside(
    seed = "",
    operation: ImageEditOperation = "generate",
    outputKind: "image" | "video" | "panorama" = "image",
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
      operation: outputKind === "image" ? operation : "generate",
      outputKind,
      referenceIds: assetId ? [assetId] : [],
      referenceUrls: refUrl && !refUrl.startsWith("data:") ? [refUrl] : [],
    });
    addEdge(node.id, id);
  }

  async function captureFrame() {
    if (!node || node.type !== "video" || !url || url.startsWith("data:")) {
      return;
    }
    try {
      pushHistory();
      const file = await captureVideoFrame(
        url,
        "current",
        getPlaybackTime(node.id),
      );
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      const imageId = addNode("image", {
        x: node.x + (node.width ?? 280) + 40,
        y: node.y,
      });
      updateNodeData(imageId, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        title: "视频截帧",
      });
      addEdge(node.id, imageId);
      toast.success("已截取当前帧");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截帧失败");
    }
  }

  async function extractAudio() {
    if (!node || node.type !== "video" || !url || url.startsWith("data:")) {
      return;
    }
    try {
      pushHistory();
      toast.success("正在抽音，请稍候…");
      const file = await extractAudioFromVideo(url);
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      const audioId = addNode("audio", {
        x: node.x + (node.width ?? 280) + 40,
        y: node.y + 40,
      });
      updateNodeData(audioId, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        title: "视频音轨",
      });
      addEdge(node.id, audioId);
      toast.success("已抽取音轨到音频节点");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "抽音失败");
    }
  }

  function adjustFont(delta: number) {
    if (!node || node.type !== "text") return;
    const current = Number(node.data.fontSize);
    const size = Number.isFinite(current) ? current : 14;
    const next = Math.min(32, Math.max(10, size + delta));
    if (next === size) return;
    pushHistory();
    updateNodeData(node.id, { fontSize: next });
  }

  async function retryPrompt() {
    if (!node || node.type !== "prompt" || !projectId) return;
    const promptText = String(node.data.prompt ?? "").trim();
    if (!promptText) return;
    const raw = String(node.data.outputKind ?? "image");
    const outputKind =
      raw === "video" || raw === "panorama" ? raw : "image";
    updateNodeData(node.id, { status: "queued", error: "" });
    try {
      const edges = useCanvasStore.getState().edges;
      const allNodes = useCanvasStore.getState().nodes;
      const { edgeAssetIds, edgeUrls } = collectIncomingMediaFromEdges(
        allNodes,
        edges,
        node.id,
      );
      const storedIds = Array.isArray(node.data.referenceIds)
        ? (node.data.referenceIds as string[])
        : [];
      const storedUrls = Array.isArray(node.data.referenceUrls)
        ? (node.data.referenceUrls as string[])
        : [];
      const canvasNodeIds = new Set(allNodes.map((item) => item.id));
      const referenceAssetIds = [
        ...new Set([
          ...storedIds.filter((id) => id && !canvasNodeIds.has(id)),
          ...edgeAssetIds,
        ]),
      ];
      const referenceUrls = [...new Set([...storedUrls, ...edgeUrls])].filter(
        (u) => u && !u.startsWith("data:") && !u.startsWith("blob:"),
      );

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
        updateNodeData(node.id, {
          status: "running",
          jobId: job.id,
          referenceIds: referenceAssetIds,
          referenceUrls,
        });
      } else {
        const finalPrompt =
          outputKind === "panorama"
            ? wrapPanoramaPrompt(promptText, {
                hasReference:
                  referenceAssetIds.length > 0 || referenceUrls.length > 0,
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
      }
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
            label="编辑"
            onClick={() => onEditImage?.(node.id)}
          >
            <CanvasIconPencil className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "upload":
        if (
          node.type !== "image" &&
          node.type !== "video" &&
          node.type !== "panorama" &&
          node.type !== "audio"
        ) {
          return null;
        }
        return (
          <ToolBtn
            key={action}
            title={
              node.type === "video"
                ? url
                  ? "替换视频"
                  : "上传视频"
                : node.type === "audio"
                  ? url
                    ? "替换音频"
                    : "上传音频"
                  : node.type === "panorama"
                    ? url
                      ? "替换全景"
                      : "上传全景"
                    : url
                      ? "替换图片"
                      : "上传图片"
            }
            label={url ? "替换" : "上传"}
            onClick={() => fileRef.current?.click()}
          >
            <CanvasIconUpload className="size-3.5" />
          </ToolBtn>
        );
      case "download":
        if (!hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="下载"
            label="下载"
            onClick={() => void onDownload()}
          >
            <CanvasIconDownload className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "spawn-prompt":
        if (
          (node.type !== "image" &&
            node.type !== "video" &&
            node.type !== "panorama" &&
            node.type !== "audio") ||
          !url
        ) {
          return null;
        }
        return (
          <ToolBtn
            key={action}
            title={
              node.type === "panorama"
                ? "旁路生全景"
                : node.type === "audio"
                  ? "用音频生视频"
                  : node.type === "video"
                    ? "旁路生图"
                    : "旁路生图"
            }
            label={
              node.type === "panorama"
                ? "生全景"
                : node.type === "audio"
                  ? "生视频"
                  : "生图"
            }
            onClick={() =>
              spawnPromptBeside(
                node.type === "panorama"
                  ? "生成可无缝衔接的 2:1 全景"
                  : node.type === "audio"
                    ? "基于参考音频生成视频"
                    : "基于参考生成",
                "generate",
                node.type === "panorama"
                  ? "panorama"
                  : node.type === "audio"
                    ? "video"
                    : "image",
              )
            }
          >
            <CanvasIconSparkles className="size-3.5" />
          </ToolBtn>
        );
      case "extract-audio":
        if (node.type !== "video" || !hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="抽取音轨"
            label="抽音轨"
            onClick={() => void extractAudio()}
          >
            <CanvasIconAudio className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "to-panorama":
        if (node.type !== "image" || !hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="转为全景"
            label="转全景"
            onClick={() => {
              pushHistory();
              convertImagePanoramaType(node.id, "panorama");
            }}
          >
            <CanvasIconPanorama className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "to-image":
        if (node.type !== "panorama" || !hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="转为普通图像"
            label="转图像"
            onClick={() => {
              pushHistory();
              convertImagePanoramaType(node.id, "image");
            }}
          >
            <CanvasIconImage className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "open-director":
        if (node.type !== "director") return null;
        return (
          <ToolBtn
            key={action}
            title="打开导演台"
            label="导演台"
            onClick={() => onOpenDirector?.(node.id)}
          >
            <CanvasIconDirector className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "spawn-video":
        if (node.type !== "image" || !url) return null;
        return (
          <ToolBtn
            key={action}
            title="图生视频"
            label="生视频"
            onClick={() =>
              spawnPromptBeside("基于参考图生成视频", "generate", "video")
            }
          >
            <CanvasIconDirector className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "capture-frame":
        if (node.type !== "video" || !hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="截取当前帧"
            label="截帧"
            onClick={() => void captureFrame()}
          >
            <CanvasIconFrame className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "outpaint":
        if (node.type !== "image" || !url || url.startsWith("data:")) return null;
        return (
          <ToolBtn
            key={action}
            title="扩图"
            label="扩图"
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
            title="局部涂抹"
            label="局部重绘"
            onClick={() => onOpenMask?.()}
          >
            <CanvasIconInpaint className="size-3.5" />
          </ToolBtn>
        );
      case "font-down":
        if (node.type !== "text") return null;
        return (
          <ToolBtn
            key={action}
            title="减小字号"
            label="缩小"
            onClick={() => adjustFont(-2)}
          >
            <CanvasIconMinus className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "font-up":
        if (node.type !== "text") return null;
        return (
          <ToolBtn
            key={action}
            title="增大字号"
            label="放大"
            onClick={() => adjustFont(2)}
          >
            <CanvasIconPlus className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "trim-audio":
        if (
          (node.type !== "audio" && node.type !== "video") ||
          !hasMedia
        ) {
          return null;
        }
        return (
          <ToolBtn
            key={action}
            title="截取音频"
            label="截取"
            onClick={() => onOpenAudioTrim?.()}
          >
            <CanvasIconScissors className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "text-to-prompt":
        if (node.type !== "text") return null;
        return (
          <ToolBtn
            key={action}
            title="用此文案生图"
            label="生图"
            onClick={() =>
              spawnPromptBeside(String(node.data.text ?? "").trim())
            }
          >
            <CanvasIconMessage className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "clear-prompt":
        if (node.type !== "prompt") return null;
        return (
          <ToolBtn
            key={action}
            title="清空提示词"
            label="清空"
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
            <CanvasIconEraser className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "retry":
        if (node.type !== "prompt") return null;
        if (status !== "failed") return null;
        if (!String(node.data.prompt ?? "").trim()) return null;
        return (
          <ToolBtn
            key={action}
            title="重试生成"
            label="重试"
            onClick={() => void retryPrompt()}
          >
            <CanvasIconRetry className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "duplicate":
        return (
          <ToolBtn
            key={action}
            title={multi ? `复制 ${nodes.length} 个` : "复制"}
            label="复制"
            onClick={() => {
              pushHistory();
              duplicateNodes(nodes.map((n) => n.id));
            }}
          >
            <CanvasIconCopy className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      case "delete":
        return (
          <ToolBtn
            key={action}
            title={multi ? `删除 ${nodes.length} 个` : "删除"}
            label="删除"
            danger
            onClick={() => {
              pushHistory();
              removeNodes(nodes.map((n) => n.id));
            }}
          >
            <CanvasIconTrash className="h-3.5 w-3.5" />
          </ToolBtn>
        );
      default:
        return null;
    }
  }

  const shown = multi
    ? []
    : mainActions.filter((action) => {
        if (
          action === "duplicate" ||
          action === "delete" ||
          action === "download"
        ) {
          return false;
        }
        if (action === "upload") return !url;
        return BAR_ACTIONS.has(action);
      });
  const shownButtons = shown.map(renderAction).filter(Boolean);
  const coreButtons = (["duplicate", "delete"] as const)
    .filter((action) => actions.includes(action))
    .map((action) => renderAction(action))
    .filter(Boolean);

  const freeResize = Boolean(node?.data.freeResize);
  const editItems: ToolMenuItem[] = [];
  const moreItems: ToolMenuItem[] = [];

  if (!multi && (node.type === "image" || node.type === "panorama")) {
    if (actions.includes("crop") && hasMedia) {
      editItems.push({
        id: "crop",
        label: "裁剪",
        icon: <CanvasIconScissors className="size-3.5 opacity-70" />,
        run: () => onOpenImageTool?.("crop"),
      });
    }
    if (actions.includes("split") && hasMedia) {
      editItems.push({
        id: "split",
        label: "切图",
        icon: <CanvasIconGrid className="size-3.5 opacity-70" />,
        run: () => onOpenImageTool?.("split"),
      });
    }
    if (actions.includes("upscale") && hasMedia) {
      editItems.push({
        id: "upscale",
        label: "智能超清",
        icon: <CanvasIconZoomIn className="size-3.5 opacity-70" />,
        run: () => onOpenImageTool?.("upscale"),
      });
    }
    if (
      actions.includes("outpaint") &&
      node.type === "image" &&
      url &&
      !url.startsWith("data:")
    ) {
      editItems.push({
        id: "outpaint",
        label: "扩图",
        icon: <CanvasIconOutpaint className="size-3.5 opacity-70" />,
        run: () =>
          spawnPromptBeside("扩图：保持主体，向四周合理延伸画面", "outpaint"),
      });
    }
    if (
      actions.includes("inpaint") &&
      node.type === "image" &&
      url &&
      !url.startsWith("data:")
    ) {
      editItems.push({
        id: "inpaint",
        label: "局部重绘",
        icon: <CanvasIconInpaint className="size-3.5 opacity-70" />,
        run: () => onOpenMask?.(),
      });
    }
    if (actions.includes("view-image") && hasMedia) {
      editItems.push({
        id: "view-image",
        label: "查看大图",
        icon: <CanvasIconMaximize className="size-3.5 opacity-70" />,
        run: () => onOpenImageTool?.("view"),
      });
    }
    if (actions.includes("toggle-resize") && hasMedia) {
      editItems.push({
        id: "toggle-resize",
        label: freeResize ? "锁定比例" : "自由比例",
        icon: freeResize ? (
          <CanvasIconUnlock className="size-3.5 opacity-70" />
        ) : (
          <CanvasIconLock className="size-3.5 opacity-70" />
        ),
        run: () => toggleFreeResize(node.id),
      });
    }
  }

  if (!multi) {
    if (
      url &&
      (node.type === "image" ||
        node.type === "video" ||
        node.type === "panorama" ||
        node.type === "audio")
    ) {
      moreItems.push({
        id: "upload",
        label:
          node.type === "video"
            ? "替换视频"
            : node.type === "audio"
              ? "替换音频"
              : node.type === "panorama"
                ? "替换全景"
                : "替换图片",
        icon: <CanvasIconUpload className="size-3.5 opacity-70" />,
        run: () => fileRef.current?.click(),
      });
    }
    if (actions.includes("to-panorama") && node.type === "image" && hasMedia) {
      moreItems.push({
        id: "to-panorama",
        label: "转全景",
        icon: <CanvasIconPanorama className="size-3.5 opacity-70" />,
        run: () => {
          pushHistory();
          convertImagePanoramaType(node.id, "panorama");
        },
      });
    }
    if (actions.includes("copy-prompt")) {
      moreItems.push({
        id: "copy-prompt",
        label: "复制提示词",
        icon: <CanvasIconFile className="size-3.5 opacity-70" />,
        run: () => copyUpstreamPrompt(node.id),
      });
    }
    if (
      actions.includes("toggle-resize") &&
      (node.type === "video" ||
        ((node.type === "image" || node.type === "panorama") && !hasMedia))
    ) {
      moreItems.push({
        id: "toggle-resize",
        label: freeResize ? "锁定比例" : "自由比例",
        icon: freeResize ? (
          <CanvasIconUnlock className="size-3.5 opacity-70" />
        ) : (
          <CanvasIconLock className="size-3.5 opacity-70" />
        ),
        run: () => toggleFreeResize(node.id),
      });
    }
    moreItems.push({
      id: "info",
      label: "信息",
      icon: <CanvasIconInfo className="size-3.5 opacity-70" />,
      run: () => onOpenInfo?.(),
    });
    if (
      (node.type === "image" ||
        node.type === "video" ||
        node.type === "panorama") &&
      onToggleGenPanel
    ) {
      moreItems.push({
        id: "gen",
        label: "生成",
        icon: (
          <CanvasIconPanelBottom
            className={cn(
              "size-3.5 opacity-70",
              genPanelOpen && "text-primary opacity-100",
            )}
          />
        ),
        run: () => onToggleGenPanel(),
      });
    }
  }

  const downloadSlot = !multi && hasMedia ? 1 : 0;
  const flatCount =
    shownButtons.length +
    editItems.length +
    moreItems.length +
    coreButtons.length +
    downloadSlot;
  const collapse = flatCount > 7;

  if (!flatCount) return null;

  function itemButton(item: ToolMenuItem) {
    return (
      <ToolBtn
        key={item.id}
        title={item.label}
        label={item.label}
        danger={item.danger}
        onClick={item.run}
      >
        {item.icon}
      </ToolBtn>
    );
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="joy-canvas-chrome flex flex-nowrap items-center justify-center gap-0.5 rounded-xl px-1 py-1">
        {multi ? (
          <span className="joy-canvas-chrome-muted px-2 text-[11px] tabular-nums">
            {nodes.length}
          </span>
        ) : null}
        {shownButtons}
        {collapse && editItems.length ? (
          <ToolDrop
            label="改图"
            title="裁剪、扩图等"
            icon={<CanvasIconScissors className="h-3.5 w-3.5" />}
            items={editItems}
          />
        ) : (
          editItems.map(itemButton)
        )}
        {collapse && moreItems.length ? (
          <ToolDrop
            label="更多"
            title="替换、信息等"
            icon={<CanvasIconMore className="h-3.5 w-3.5" />}
            items={moreItems}
          />
        ) : (
          moreItems.map(itemButton)
        )}
        {coreButtons.length ? (
          <span className="mx-0.5 h-4 w-px bg-border/80" aria-hidden />
        ) : null}
        {!multi && hasMedia ? (
          <ToolBtn title="下载" onClick={() => void onDownload()}>
            <CanvasIconDownload className="h-3.5 w-3.5" />
          </ToolBtn>
        ) : null}
        {coreButtons}
      </div>

      {!multi &&
      (node.type === "image" ||
        node.type === "video" ||
        node.type === "panorama" ||
        node.type === "audio") ? (
        <input
          ref={fileRef}
          type="file"
          accept={
            node.type === "video"
              ? "video/*"
              : node.type === "audio"
                ? "audio/*"
                : "image/*"
          }
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

type ToolMenuItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  run: () => void;
};

function ToolDrop({
  label,
  title,
  icon,
  items,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  items: ToolMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={rootRef} className="relative">
      <ToolBtn title={title} label={label} onClick={() => setOpen((value) => !value)}>
        {icon}
        <span className="text-[10px] opacity-60" aria-hidden>
          ▾
        </span>
      </ToolBtn>
      {open ? (
        <div className="joy-canvas-chrome absolute bottom-[calc(100%+6px)] left-0 z-40 min-w-[148px] overflow-hidden rounded-xl py-1">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                item.danger && "text-destructive",
              )}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
