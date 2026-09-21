"use client";

import {
  CanvasIconAudio,
  CanvasIconCopy,
  CanvasIconDirector,
  CanvasIconDownload,
  CanvasIconEraser,
  CanvasIconFile,
  CanvasIconFolderPlus,
  CanvasIconFrame,
  CanvasIconGrid,
  CanvasIconImage,
  CanvasIconInfo,
  CanvasIconLock,
  CanvasIconMaximize,
  CanvasIconMessage,
  CanvasIconMinus,
  CanvasIconPanelBottom,
  CanvasIconPanorama,
  CanvasIconPencil,
  CanvasIconPlus,
  CanvasIconRetry,
  CanvasIconScissors,
  CanvasIconTrash,
  CanvasIconUnlock,
  CanvasIconWand,
  CanvasIconZoomIn,
} from "./icons/canvas-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { separateAudioToNode } from "./lib/extract-audio-to-node";
import { videoRefMode } from "./lib/video-ref-mode";
import { getPlaybackTime } from "./lib/playback-clock";
import { wrapPanoramaPrompt } from "./lib/panorama-prompt";
import { convertImagePanoramaType } from "./lib/convert-media-type";
import {
  collectIncomingMediaFromEdges,
} from "./lib/canvas-media-refs";
import { uploadFileIntoNode, uploadFileToNewNode } from "./lib/upload-to-node";
import { api } from "@/shared/lib/api";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";
import { CANVAS_TEXT_FONT } from "@/shared/theme";
import type { ImageToolMode } from "./image-tool-dialog";
import {
  copyUpstreamPrompt,
  toggleFreeResize,
} from "./lib/image-node-actions";
import { canSaveNodeAsset, saveNodeAsset } from "./lib/save-node-asset";
import { spawnReversePrompt } from "./lib/reverse-prompt";
import {
  BAR_ALWAYS_TOOL_IDS,
  DEFAULT_PANORAMA_QUICK_TOOL_IDS,
  DEFAULT_QUICK_TOOL_IDS,
  EDIT_MENU_TOOL_IDS,
  IMAGE_QUICK_TOOLS_KEY,
  PANORAMA_QUICK_TOOLS_KEY,
  PINNED_BAR_TOOL_IDS,
  isBarAlwaysToolId,
  isEditMenuToolId,
  isOverflowOnlyToolId,
  readQuickTools,
  writeQuickTools,
  type QuickToolId,
  type QuickToolsConfig,
} from "./lib/quick-tools";
import { ImageToolbarSettings } from "./image-toolbar-settings";
import { CanvasIconMore } from "./icons/canvas-icons";

type Props = {
  nodes: CanvasNode[];
  viewport: Viewport;
  onOpenDirector?: (nodeId: string) => void;
  genPanelOpen?: boolean;
  onToggleGenPanel?: () => void;
  onOpenImageTool?: (mode: ImageToolMode) => void;
  onOpenAngle?: () => void;
  onOpenInfo?: () => void;
  onOpenAudioTrim?: () => void;
  onOpenMask?: () => void;
  onPinToolbar?: (pinned: boolean) => void;
};

function ToolBtn({
  title,
  label,
  danger,
  caret,
  onClick,
  children,
}: {
  title: string;
  /** Short visible name next to the icon (optional; omit for compact icon-only). */
  label?: string;
  danger?: boolean;
  caret?: ReactNode;
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
        "joy-canvas-chrome-btn inline-flex h-[var(--joy-canvas-float-btn)] items-center justify-center rounded-md transition",
        label ? "gap-1 px-2" : "size-[length:var(--joy-canvas-float-btn)]",
        danger && "hover:bg-destructive/15 hover:text-destructive",
      )}
    >
      {children}
      {label ? (
        <span className="whitespace-nowrap text-[length:var(--joy-canvas-chrome-font-sm)] font-medium leading-none tracking-wide">
          {label}
        </span>
      ) : null}
      {caret}
    </button>
  );
}

const RASTER_ACTIONS = new Set<NodeToolbarAction>([
  "crop",
  "split",
  "upscale",
  "angle",
  "view-image",
  "copy-prompt",
  "reverse-prompt",
  "toggle-resize",
  "save-asset",
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
  onOpenDirector,
  genPanelOpen,
  onToggleGenPanel,
  onOpenImageTool,
  onOpenAngle,
  onOpenInfo,
  onOpenAudioTrim,
  onOpenMask,
  onPinToolbar,
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
  const quickKind =
    nodes.length === 1 && nodes[0]?.type === "panorama"
      ? "panorama"
      : nodes.length === 1 && nodes[0]?.type === "image"
        ? "image"
        : null;
  const quickKey =
    quickKind === "panorama" ? PANORAMA_QUICK_TOOLS_KEY : IMAGE_QUICK_TOOLS_KEY;
  const quickFallback =
    quickKind === "panorama"
      ? DEFAULT_PANORAMA_QUICK_TOOL_IDS
      : DEFAULT_QUICK_TOOL_IDS;
  const [quickConfig, setQuickConfig] = useState<QuickToolsConfig>({
    ids: DEFAULT_QUICK_TOOL_IDS,
    showLabels: true,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<QuickToolId[]>(DEFAULT_QUICK_TOOL_IDS);
  const [draftLabels, setDraftLabels] = useState(true);

  useEffect(() => {
    if (!quickKind) return;
    setQuickConfig(readQuickTools(quickKey, quickFallback));
    setSettingsOpen(false);
  }, [quickKind, quickKey, quickFallback, nodes[0]?.id]);

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

  // Empty media placeholders only need the gen / upload UI — no header chrome.
  if (
    !multi &&
    node &&
    (node.type === "image" ||
      node.type === "video" ||
      node.type === "panorama" ||
      node.type === "audio") &&
    !hasMedia
  ) {
    return null;
  }

  async function onUpload(file: File) {
    if (!node) return;
    try {
      await uploadFileIntoNode(node.id, file);
    } catch {
      /* node already shows failed state */
    }
  }

  async function onDownload() {
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const preferred = String(node?.data.fileName ?? "").trim();
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
      a.download =
        preferred && !/\.[a-z0-9]{2,5}$/i.test(preferred)
          ? `${preferred}.${ext}`
          : preferred || `joyai-${node.type}-${node.id.slice(0, 6)}.${ext}`;
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
      const imageId = await uploadFileToNewNode(
        file,
        {
          x: node.x + (node.width ?? 280) + 40,
          y: node.y,
        },
        {
          history: false,
          preferredType: "image",
          title: "视频截帧",
        },
      );
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
      await separateAudioToNode(node.id);
      toast.success("已分离为音频与无声视频");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "分离音频失败");
    }
  }

  function adjustFont(delta: number) {
    if (!node || node.type !== "text") return;
    const current = Number(node.data.fontSize);
    const size = Number.isFinite(current) ? current : CANVAS_TEXT_FONT.default;
    const next = Math.min(
      CANVAS_TEXT_FONT.max,
      Math.max(CANVAS_TEXT_FONT.min, size + delta),
    );
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
            <CanvasIconUpload className="joy-canvas-tool-icon" />
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
            <CanvasIconDownload className="joy-canvas-tool-icon" />
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
            <CanvasIconSparkles className="joy-canvas-tool-icon" />
          </ToolBtn>
        );
      case "extract-audio":
        if (node.type !== "video" || !hasMedia) return null;
        return (
          <ToolBtn
            key={action}
            title="分离音频"
            label="分离音频"
            onClick={() => void extractAudio()}
          >
            <CanvasIconAudio className="joy-canvas-tool-icon" />
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
            <CanvasIconPanorama className="joy-canvas-tool-icon" />
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
            <CanvasIconImage className="joy-canvas-tool-icon" />
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
            <CanvasIconDirector className="joy-canvas-tool-icon" />
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
            <CanvasIconDirector className="joy-canvas-tool-icon" />
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
            <CanvasIconFrame className="joy-canvas-tool-icon" />
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
            <CanvasIconOutpaint className="joy-canvas-tool-icon" />
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
            <CanvasIconInpaint className="joy-canvas-tool-icon" />
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
            <CanvasIconMinus className="joy-canvas-tool-icon" />
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
            <CanvasIconPlus className="joy-canvas-tool-icon" />
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
            title={node.type === "video" ? "剪辑" : "截取音频"}
            label={node.type === "video" ? "剪辑" : "截取"}
            onClick={() => onOpenAudioTrim?.()}
          >
            <CanvasIconScissors className="joy-canvas-tool-icon" />
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
            <CanvasIconMessage className="joy-canvas-tool-icon" />
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
            <CanvasIconEraser className="joy-canvas-tool-icon" />
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
            <CanvasIconRetry className="joy-canvas-tool-icon" />
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
            <CanvasIconCopy className="joy-canvas-tool-icon" />
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
            <CanvasIconTrash className="joy-canvas-tool-icon" />
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
  const primaryItems: ToolMenuItem[] = [];
  const editItems: ToolMenuItem[] = [];
  const moreItems: ToolMenuItem[] = [];

  if (!multi && node.type === "panorama") {
    if (actions.includes("to-image") && hasMedia) {
      primaryItems.push({
        id: "to-image",
        label: "转图像",
        icon: <CanvasIconImage className="joy-canvas-tool-icon opacity-70" />,
        run: () => {
          pushHistory();
          convertImagePanoramaType(node.id, "image");
        },
      });
    }
    if (actions.includes("upload")) {
      primaryItems.push({
        id: "upload",
        label: url ? "替换全景" : "上传全景",
        icon: <CanvasIconUpload className="joy-canvas-tool-icon opacity-70" />,
        run: () => fileRef.current?.click(),
      });
    }
  }

  if (!multi && (node.type === "image" || node.type === "panorama")) {
    if (actions.includes("crop") && hasMedia) {
      editItems.push({
        id: "crop",
        label: "裁剪",
        icon: <CanvasIconScissors className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenImageTool?.("crop"),
      });
    }
    if (actions.includes("split") && hasMedia) {
      editItems.push({
        id: "split",
        label: "切图",
        icon: <CanvasIconGrid className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenImageTool?.("split"),
      });
    }
    if (actions.includes("upscale") && hasMedia) {
      editItems.push({
        id: "upscale",
        label: "本地放大",
        icon: <CanvasIconZoomIn className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenImageTool?.("upscale"),
      });
    }
    if (actions.includes("angle") && hasMedia) {
      editItems.push({
        id: "angle",
        label: "多角度",
        icon: <CanvasIconWand className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenAngle?.(),
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
        icon: <CanvasIconOutpaint className="joy-canvas-tool-icon opacity-70" />,
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
        icon: <CanvasIconInpaint className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenMask?.(),
      });
    }
    if (actions.includes("view-image") && hasMedia) {
      editItems.push({
        id: "view-image",
        label: "查看大图",
        icon: <CanvasIconMaximize className="joy-canvas-tool-icon opacity-70" />,
        run: () => onOpenImageTool?.("view"),
      });
    }
  }

  if (!multi) {
    if (
      actions.includes("save-asset") &&
      canSaveNodeAsset(node) &&
      !hasMedia &&
      node.type === "text"
    ) {
      moreItems.push({
        id: "save-asset",
        label: "存素材",
        icon: <CanvasIconFolderPlus className="joy-canvas-tool-icon opacity-70" />,
        run: () => void saveNodeAsset(node.id),
      });
    }
    if (
      url &&
      (node.type === "image" ||
        node.type === "video" ||
        node.type === "audio" ||
        (node.type === "panorama" &&
          !primaryItems.some((item) => item.id === "upload")))
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
        icon: <CanvasIconUpload className="joy-canvas-tool-icon opacity-70" />,
        run: () => fileRef.current?.click(),
      });
    }
    if (actions.includes("to-panorama") && node.type === "image" && hasMedia) {
      moreItems.push({
        id: "to-panorama",
        label: "转全景",
        icon: <CanvasIconPanorama className="joy-canvas-tool-icon opacity-70" />,
        run: () => {
          pushHistory();
          convertImagePanoramaType(node.id, "panorama");
        },
      });
    }
    if (
      actions.includes("toggle-resize") &&
      (node.type === "video" ||
        node.type === "image" ||
        node.type === "panorama")
    ) {
      moreItems.push({
        id: "toggle-resize",
        label: freeResize ? "锁定比例" : "自由比例",
        icon: freeResize ? (
          <CanvasIconUnlock className="joy-canvas-tool-icon opacity-70" />
        ) : (
          <CanvasIconLock className="joy-canvas-tool-icon opacity-70" />
        ),
        run: () => toggleFreeResize(node.id),
      });
    }
    if (actions.includes("reverse-prompt") && hasMedia) {
      moreItems.push({
        id: "reverse-prompt",
        label: "反推提示词",
        icon: <CanvasIconMessage className="joy-canvas-tool-icon opacity-70" />,
        run: () => void spawnReversePrompt(node.id),
      });
    }
    if (actions.includes("copy-prompt")) {
      moreItems.push({
        id: "copy-prompt",
        label: "复制提示词",
        icon: <CanvasIconFile className="joy-canvas-tool-icon opacity-70" />,
        run: () => copyUpstreamPrompt(node.id),
      });
    }
    moreItems.push({
      id: "info",
      label: "信息",
      icon: <CanvasIconInfo className="joy-canvas-tool-icon opacity-70" />,
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
              "joy-canvas-tool-icon opacity-70",
              genPanelOpen && "text-primary opacity-100",
            )}
          />
        ),
        run: () => onToggleGenPanel(),
      });
    }
  }

  const downloadSlot = !multi && hasMedia ? 1 : 0;
  const saveSlot =
    !multi && actions.includes("save-asset") && canSaveNodeAsset(node) ? 1 : 0;
  const quickMode = Boolean(quickKind);
  const quickCatalog: ToolMenuItem[] = quickMode
    ? [
        ...primaryItems,
        ...editItems,
        ...moreItems,
        ...(saveSlot && node
          ? [
              {
                id: "save-asset",
                label: "存素材",
                icon: <CanvasIconFolderPlus className="joy-canvas-tool-icon opacity-70" />,
                run: () => void saveNodeAsset(node.id),
              },
            ]
          : []),
        ...(downloadSlot
          ? [
              {
                id: "download",
                label: "下载",
                icon: <CanvasIconDownload className="joy-canvas-tool-icon opacity-70" />,
                run: () => void onDownload(),
              },
            ]
          : []),
        ...(["duplicate", "delete"] as const)
          .filter((action) => actions.includes(action))
          .map((action) => ({
            id: action,
            label: action === "delete" ? "删除" : "复制",
            danger: action === "delete",
            icon:
              action === "delete" ? (
                <CanvasIconTrash className="joy-canvas-tool-icon opacity-70" />
              ) : (
                <CanvasIconCopy className="joy-canvas-tool-icon opacity-70" />
              ),
            run: () => {
              pushHistory();
              if (action === "delete") removeNodes(nodes.map((n) => n.id));
              else duplicateNodes(nodes.map((n) => n.id));
            },
          })),
      ]
    : [];
  const visibleQuick = quickMode
    ? quickCatalog.filter((item) => {
        const id = item.id as QuickToolId;
        if (PINNED_BAR_TOOL_IDS.includes(id)) return true;
        if (isBarAlwaysToolId(id)) return true;
        if (isOverflowOnlyToolId(id) || isEditMenuToolId(id)) return false;
        if (node.type === "panorama" && id === "to-image") {
          return true;
        }
        return quickConfig.ids.includes(id);
      })
    : [];
  /** Icon-only by default; labeled mode still caps the strip so it stays short. */
  const MAX_FLEX_BAR_TOOLS = quickConfig.showLabels ? 4 : 6;
  const pinnedBar = visibleQuick.filter((item) =>
    PINNED_BAR_TOOL_IDS.includes(item.id as QuickToolId),
  );
  // Edit tools always live under the 编辑 menu when available (not gated by quick ids).
  const editMenuItems = EDIT_MENU_TOOL_IDS.map((id) =>
    quickCatalog.find((item) => item.id === id),
  ).filter((item): item is ToolMenuItem => Boolean(item));
  const alwaysBar = BAR_ALWAYS_TOOL_IDS.map((id) =>
    visibleQuick.find((item) => item.id === id),
  ).filter((item): item is ToolMenuItem => Boolean(item));
  const flexBar = [
    ...alwaysBar,
    ...visibleQuick
      .filter(
        (item) =>
          !PINNED_BAR_TOOL_IDS.includes(item.id as QuickToolId) &&
          !isEditMenuToolId(item.id) &&
          !isBarAlwaysToolId(item.id),
      )
      .slice(0, Math.max(0, MAX_FLEX_BAR_TOOLS - alwaysBar.length)),
  ];
  const barQuick = [...editMenuItems, ...flexBar, ...pinnedBar];
  const barIds = new Set(barQuick.map((item) => item.id));
  /** Tools not on the bar — grouped, opened as right-side submenus. */
  const overflowFlat: ToolMenuItem[] = quickMode
    ? quickCatalog.filter(
        (item) =>
          !barIds.has(item.id) &&
          !PINNED_BAR_TOOL_IDS.includes(item.id as QuickToolId) &&
          !isEditMenuToolId(item.id),
      )
    : [];
  const overflowGroups: ToolMenuGroup[] = quickMode
    ? [
        ...groupOverflowTools(overflowFlat),
        {
          id: "settings",
          label: "设置",
          items: [
            {
              id: "configure-tools",
              label: "配置快捷工具",
              icon: <CanvasIconMore className="joy-canvas-tool-icon opacity-70" />,
              run: () => {
                setDraftIds(quickConfig.ids);
                setDraftLabels(quickConfig.showLabels);
                setSettingsOpen(true);
                onPinToolbar?.(true);
              },
            },
          ],
        },
      ].filter((group) => group.items.length > 0)
    : [];
  const flatCount = quickMode
    ? (editMenuItems.length ? 1 : 0) + flexBar.length + pinnedBar.length + 1
    : shownButtons.length +
      editItems.length +
      moreItems.length +
      coreButtons.length +
      downloadSlot +
      saveSlot;

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
      className="joy-canvas-float-toolbar pointer-events-auto absolute z-30 -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="joy-canvas-chrome flex flex-nowrap items-center justify-center gap-1 rounded-xl px-1 py-1">
        {multi ? (
          <span className="joy-canvas-chrome-muted px-1.5 text-[11px] tabular-nums">
            {nodes.length}
          </span>
        ) : null}
        {quickMode ? (
          <>
            {editMenuItems.length ? (
              <ToolDrop
                label={quickConfig.showLabels ? "编辑" : undefined}
                title="编辑"
                icon={<CanvasIconPencil className="joy-canvas-tool-icon" />}
                items={editMenuItems}
              />
            ) : null}
            {flexBar.map((item) => (
              <ToolBtn
                key={item.id}
                title={item.label}
                label={quickConfig.showLabels ? item.label : undefined}
                danger={item.danger}
                onClick={item.run}
              >
                {item.icon}
              </ToolBtn>
            ))}
            {pinnedBar.length ? (
              <span className="mx-0.5 h-3.5 w-px bg-border/80" aria-hidden />
            ) : null}
            {pinnedBar.map((item) => (
              <ToolBtn
                key={item.id}
                title={item.label}
                danger={item.danger}
                onClick={item.run}
              >
                {item.icon}
              </ToolBtn>
            ))}
            {overflowGroups.length ? (
              <ToolDrop
                label={quickConfig.showLabels ? "更多" : undefined}
                title="更多功能"
                icon={<CanvasIconMore className="joy-canvas-tool-icon" />}
                groups={overflowGroups}
                cascade
              />
            ) : null}
          </>
        ) : (
          <>
            {shownButtons}
            {editItems.length ? (
              <ToolDrop
                label="编辑"
                title="编辑"
                icon={<CanvasIconPencil className="joy-canvas-tool-icon" />}
                items={editItems}
              />
            ) : null}
            {moreItems.map(itemButton)}
            {coreButtons.length ? (
              <span className="mx-0.5 h-4 w-px bg-border/80" aria-hidden />
            ) : null}
            {!multi && hasMedia ? (
              <>
                {actions.includes("save-asset") && canSaveNodeAsset(node) ? (
                  <ToolBtn
                    title="加入我的素材"
                    onClick={() => void saveNodeAsset(node.id)}
                  >
                    <CanvasIconFolderPlus className="joy-canvas-tool-icon" />
                  </ToolBtn>
                ) : null}
                <ToolBtn title="下载" onClick={() => void onDownload()}>
                  <CanvasIconDownload className="joy-canvas-tool-icon" />
                </ToolBtn>
              </>
            ) : null}
            {coreButtons}
          </>
        )}
      </div>

      {quickMode ? (
        <ImageToolbarSettings
          open={settingsOpen}
          options={quickCatalog
            .filter(
              (item) =>
                !PINNED_BAR_TOOL_IDS.includes(item.id as QuickToolId) &&
                !isEditMenuToolId(item.id) &&
                !isOverflowOnlyToolId(item.id),
            )
            .map((item) => ({
              id: item.id as QuickToolId,
              label: item.label,
            }))}
          selected={draftIds.filter(
            (id) => !PINNED_BAR_TOOL_IDS.includes(id),
          )}
          showLabels={draftLabels}
          onSelectedChange={setDraftIds}
          onShowLabelsChange={setDraftLabels}
          onClose={() => {
            setSettingsOpen(false);
            onPinToolbar?.(false);
          }}
          onSave={() => {
            const next = {
              ids: [
                ...new Set([...draftIds, ...PINNED_BAR_TOOL_IDS]),
              ] as QuickToolId[],
              showLabels: draftLabels,
            };
            try {
              writeQuickTools(quickKey, next);
            } catch {
              toast.error("快捷工具配置保存失败");
              return;
            }
            setQuickConfig(next);
            setSettingsOpen(false);
            onPinToolbar?.(false);
            toast.success("已保存快捷工具");
          }}
        />
      ) : null}

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

type ToolMenuGroup = {
  id: string;
  label: string;
  items: ToolMenuItem[];
};

const OVERFLOW_GROUP_ORDER: { id: string; label: string; ids: string[] }[] = [
  {
    id: "generate",
    label: "生成",
    ids: ["gen"],
  },
  {
    id: "edit",
    label: "编辑",
    ids: [
      "upload",
      "inpaint",
      "outpaint",
      "crop",
      "upscale",
      "angle",
      "view-image",
    ],
  },
  {
    id: "media",
    label: "媒体",
    ids: ["split", "to-panorama", "to-image", "toggle-resize"],
  },
  {
    id: "prompt",
    label: "提示词",
    ids: ["reverse-prompt", "copy-prompt"],
  },
  {
    id: "manage",
    label: "管理",
    ids: ["save-asset", "download", "info", "duplicate", "delete"],
  },
];

function groupOverflowTools(items: ToolMenuItem[]): ToolMenuGroup[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const groups: ToolMenuGroup[] = [];

  for (const group of OVERFLOW_GROUP_ORDER) {
    const next = group.ids
      .map((id) => byId.get(id))
      .filter((item): item is ToolMenuItem => Boolean(item));
    if (!next.length) continue;
    next.forEach((item) => used.add(item.id));
    groups.push({ id: group.id, label: group.label, items: next });
  }

  const rest = items.filter((item) => !used.has(item.id));
  if (rest.length) {
    groups.push({ id: "other", label: "其他", items: rest });
  }
  return groups;
}

function ToolDrop({
  label,
  title,
  icon,
  items,
  groups,
  cascade = false,
}: {
  label?: string;
  title: string;
  icon: React.ReactNode;
  items?: ToolMenuItem[];
  groups?: ToolMenuGroup[];
  /** Group names on the left; tools expand to the right. */
  cascade?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const resolvedGroups =
    groups ??
    (items?.length ? [{ id: "all", label: "", items }] : []);
  const useCascade =
    cascade &&
    resolvedGroups.length > 0 &&
    resolvedGroups.some((group) => group.label);

  useEffect(() => {
    if (!open) {
      setActiveGroup(null);
      return;
    }
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [open]);

  if (!resolvedGroups.some((group) => group.items.length)) return null;

  const submenu =
    useCascade && activeGroup
      ? resolvedGroups.find(
          (group) => group.id === activeGroup && group.items.length > 1,
        ) ?? null
      : null;

  return (
    <div ref={rootRef} className="relative">
      <ToolBtn
        title={title}
        label={label}
        caret={
          <ChevronDown
            className={cn(
              "joy-canvas-tool-icon shrink-0 text-muted-foreground transition-transform duration-150",
              open && "rotate-180",
            )}
            aria-hidden
          />
        }
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
      </ToolBtn>
      {open ? (
        useCascade ? (
          <div className="absolute left-0 top-[calc(100%+6px)] z-40 flex items-start">
            <div className="joy-canvas-chrome min-w-[140px] overflow-hidden rounded-xl py-1">
              {resolvedGroups.map((group) => {
                if (group.items.length === 1) {
                  const item = group.items[0]!;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "joy-canvas-menu-item flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                        item.danger && "text-destructive",
                      )}
                      onMouseEnter={() => setActiveGroup(null)}
                      onClick={() => {
                        setOpen(false);
                        item.run();
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </button>
                  );
                }
                const active = group.id === activeGroup;
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={cn(
                      "joy-canvas-menu-item flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px]",
                      active && "bg-muted",
                    )}
                    onMouseEnter={() => setActiveGroup(group.id)}
                    onFocus={() => setActiveGroup(group.id)}
                    onClick={() => setActiveGroup(group.id)}
                  >
                    <span>{group.label || "菜单"}</span>
                    <ChevronRight
                      className="joy-canvas-tool-icon shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            {submenu ? (
              <div className="joy-canvas-chrome ml-1 min-w-[148px] overflow-hidden rounded-xl py-1">
                {submenu.items.map((item) => (
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
        ) : (
          <div className="joy-canvas-chrome absolute left-0 top-[calc(100%+6px)] z-40 min-w-[148px] overflow-hidden rounded-xl py-1">
            {resolvedGroups.flatMap((group) => group.items).map((item) => (
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
        )
      ) : null}
    </div>
  );
}
