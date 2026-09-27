"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  CanvasSnapshot,
} from "@joyai/shared";
import { useCanvasStore } from "./store";
import { CanvasToolbar } from "./toolbar";
import { CanvasCreateRail } from "./canvas-create-rail";
import { CanvasTopBar } from "./canvas-top-bar";
import { CanvasDock } from "./canvas-dock";
import {
  CanvasMinimap,
  readMinimapOpenPreference,
  writeMinimapOpenPreference,
} from "./canvas-minimap";
import { CanvasShortcutsHelp } from "./canvas-shortcuts-help";
import { NodeFloatToolbar } from "./node-float-toolbar";
import { MultiSelectToolbar } from "./multi-select-toolbar";
import { GroupBoundsOverlay, GROUP_PAD, SELECTION_PAD } from "./group-bounds-overlay";
import { NodeView } from "./node-view";
import { NodeResizeHandles } from "./node-resize-handles";
import { NodeGenPanel } from "./node-gen-panel";
import {
  CanvasEdges,
  NodeHandles,
  SelectionConnectHandle,
  type ConnectDraft,
} from "./canvas-edges";
import { hitNodeAt, nodeBox } from "./lib/node-box";
import {
  preferredConnectTargetType,
} from "./lib/edge-compat";
import { colorTagMeta, colorTagOf } from "./lib/color-tag";
import { useColorTagFocusStore } from "./color-tag-focus-store";
import {
  CanvasCreateMenu,
  CanvasNodeContextMenu,
  type CanvasCreateMenuState,
  type CanvasNodeMenuState,
} from "./canvas-context-menu";
import { CanvasRightPanel } from "./canvas-right-panel";
import { CanvasAgentDrawer } from "./canvas-agent-drawer";
import { CanvasAssetDialog } from "./canvas-asset-dialog";
import { useCanvasRightPanelStore } from "./right-panel-store";
import { computeMentionHighlightIds } from "./lib/mention-highlight";
import {
  CANVAS_GRID,
  readSnapPreference,
  snapPoint,
  writeSnapPreference,
} from "./lib/snap";
import {
  applyGroupDrop,
  findGroupDropTarget,
  groupIdOf,
  isCompleteGroupSelection,
  memberIdsOfGroup,
  selectionBounds,
} from "./lib/align";
import { copiedGroupId, prepareCopiedData } from "./lib/copy-node";
import {
  isCanvasOverlayTarget,
  readEdgeVisibilityPreference,
  readGridModePreference,
  writeEdgeVisibilityPreference,
  writeGridModePreference,
  type CanvasEdgeVisibility,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import { spawnVideoFrameNode } from "./lib/spawn-video-frame-node";
import { getPlaybackTime } from "./lib/playback-clock";
import { api, apiUpload } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import {
  titleFromPrompt,
  mediaNamePatch,
  originalNameFromAsset,
} from "./lib/node-title";
import { toast } from "@/shared/lib/toast";
import { DirectorDesk } from "./director-desk";
import { ImageToolDialog, type ImageToolMode } from "./image-tool-dialog";
import { ImageAngleDialog } from "./image-angle-dialog";
import { ImageReversePromptDialog } from "./image-reverse-prompt-dialog";
import { ImageFxDialog } from "./image-fx-dialog";
import { ImageRotateDialog } from "./image-rotate-dialog";
import { NodeGenHistoryDialog } from "./node-gen-history-dialog";
import { ImageOutpaintDialog } from "./image-outpaint-dialog";
import { ImageScribbleDialog } from "./image-scribble-dialog";
import { ImageLightingDialog } from "./image-lighting-dialog";
import { NodeInfoDialog } from "./node-info-dialog";
import { AudioTrimDialog } from "./audio-trim-dialog";
import { VideoFramePickDialog } from "./video-frame-dialog";
import { MaskEditDialog } from "./mask-edit-dialog";
import { ImageRedrawDialog } from "./image-redraw-dialog";
import { trimMediaToFile } from "./lib/trim-audio";
import { trimVideoToFile } from "./lib/trim-video";
import { flagPanoramaAspect } from "./lib/panorama-prompt";
import { spawnPanoramaPrompt } from "./lib/spawn-panorama-prompt";
import { ImagePanoramaDialog } from "./image-panorama-dialog";
import { commitImagePieces } from "./lib/commit-image-pieces";
import { downloadNodeMedia } from "./lib/download-node-media";
import { canSaveNodeAsset, saveNodeAsset } from "./lib/save-node-asset";
import { spawnReversePrompt } from "./lib/reverse-prompt";
import { spawnAnglePrompt } from "./lib/spawn-angle-prompt";
import { spawnImageFx } from "./lib/spawn-image-fx";
import type { ImageFxMode } from "./lib/image-fx";
import { spawnRotatedImage } from "./lib/rotate-node-image";
import { spawnLightingPrompt } from "./lib/spawn-lighting-prompt";
import { spawnMarkedImageEdit } from "./lib/spawn-marked-edit";
import { nodeTitleLabel } from "./lib/node-chrome";
import type { RasterPiece } from "./lib/image-raster";
import {
  nodeTypeForAssetKind,
  probeImageUrlType,
} from "./lib/upload-node-type";
import { separateAudioToNode } from "./lib/extract-audio-to-node";
import { uploadFileToNewNode } from "./lib/upload-to-node";
import { frameNodeToMedia } from "./lib/fit-node-size";
import {
  expandIdsWithBatch,
  isHiddenBatchChild,
} from "./lib/batch-group";
import {
  handleCanvasJobCompleted,
  handleCanvasJobFailed,
} from "./lib/handle-job-event";
import { isBusyStatus } from "./node-registry";
import "./canvas-chrome.css";

function notePanoramaAspect(nodeId: string, url: string) {
  flagPanoramaAspect(url, (aspectHint) => {
    useCanvasStore.getState().updateNodeData(nodeId, { aspectHint });
  });
}

type ProjectPayload = {
  id: string;
  title: string;
  snapshot: CanvasSnapshot | null;
};

type Marquee = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

type FocusQuery = {
  nodeId?: string | null;
  jobId?: string | null;
  assetId?: string | null;
  /** Studio hover deep-link — open image tool / mask / angle after focus. */
  tool?: string | null;
};

const STUDIO_DEEP_TOOLS = new Set([
  "crop",
  "split",
  "view",
  "inpaint",
  "angle",
  "to-panorama",
  "capture-frame",
  "extract-audio",
  "trim-video",
]);

function resolveFocusTargetId(opts: {
  nodeId?: string | null;
  jobId?: string | null;
  assetId?: string | null;
}): string | null {
  const { nodes } = useCanvasStore.getState();
  if (opts.nodeId) {
    const hit = nodes.find((n) => n.id === opts.nodeId);
    if (hit) return hit.id;
  }
  if (opts.jobId) {
    const byJob = nodes.find(
      (n) => String(n.data.jobId ?? "") === opts.jobId,
    );
    if (byJob) return byJob.id;
  }
  if (opts.assetId) {
    const byAsset = nodes.find(
      (n) => String(n.data.assetId ?? "") === opts.assetId,
    );
    if (byAsset) return byAsset.id;
  }
  return null;
}

type ClipboardPayload = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function mediaKindOf(
  node: CanvasNode,
): "image" | "video" | "panorama" | "audio" | null {
  if (
    node.type === "image" ||
    node.type === "video" ||
    node.type === "panorama" ||
    node.type === "audio"
  ) {
    return node.type;
  }
  return null;
}

export function CanvasBoard({
  projectId,
  focusQuery,
}: {
  projectId: string;
  focusQuery?: FocusQuery;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const uploadAtRef = useRef<{ x: number; y: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isNodeDragging, setIsNodeDragging] = useState(false);
  const [dropTargetGid, setDropTargetGid] = useState<string | null>(null);
  const [isNodeResizing, setIsNodeResizing] = useState(false);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [gridMode, setGridMode] = useState<CanvasGridMode>("dots");
  const [edgeVisibility, setEdgeVisibility] =
    useState<CanvasEdgeVisibility>("all");
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [createMenu, setCreateMenu] = useState<CanvasCreateMenuState | null>(
    null,
  );
  const createMenuRef = useRef<CanvasCreateMenuState | null>(null);
  createMenuRef.current = createMenu;
  const [nodeMenu, setNodeMenu] = useState<CanvasNodeMenuState | null>(null);
  const [imageTool, setImageTool] = useState<{
    nodeId: string;
    url: string;
    mode: ImageToolMode;
  } | null>(null);
  const [angleNodeId, setAngleNodeId] = useState<string | null>(null);
  const [panoramaNodeId, setPanoramaNodeId] = useState<string | null>(null);
  const [reversePromptNodeId, setReversePromptNodeId] = useState<string | null>(
    null,
  );
  const [imageFx, setImageFx] = useState<{
    nodeId: string;
    mode: ImageFxMode;
  } | null>(null);
  const [rotateEdit, setRotateEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [nodeHistoryId, setNodeHistoryId] = useState<string | null>(null);
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
  const [audioTrim, setAudioTrim] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [audioTrimBusy, setAudioTrimBusy] = useState(false);
  const [framePick, setFramePick] = useState<{
    nodeId: string;
    url: string;
    initialTime: number;
  } | null>(null);
  const [framePickBusy, setFramePickBusy] = useState(false);
  const [maskEdit, setMaskEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [redrawEdit, setRedrawEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [outpaintEdit, setOutpaintEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [scribbleEdit, setScribbleEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [lightingEdit, setLightingEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [projectReady, setProjectReady] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [connectDraft, setConnectDraft] = useState<ConnectDraft | null>(null);
  const focusApplied = useRef(false);
  /** Active connect sources (1 = single green-dot, ≥2 = selection fan-out). */
  const connectSourcesRef = useRef<string[]>([]);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const drag = useRef<{
    ids: string[];
    ox: number;
    oy: number;
    origins: Record<string, { x: number; y: number }>;
    /** Click (no move) on a member while the whole group is selected → pick that node. */
    clickToNodeId?: string | null;
  } | null>(null);
  const dragPushed = useRef(false);
  const marqueeRef = useRef<Marquee | null>(null);
  const marqueeAdditive = useRef(false);
  const clipboard = useRef<ClipboardPayload>({ nodes: [], edges: [] });

  const viewport = useCanvasStore((s) => s.viewport);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const focusedColorTag = useColorTagFocusStore((s) => s.focusedTag);
  const selectedEdgeId = useCanvasStore((s) => s.selectedEdgeId);
  const snapToGrid = useCanvasStore((s) => s.snapToGrid);
  const dirty = useCanvasStore((s) => s.dirty);
  const past = useCanvasStore((s) => s.past);
  const future = useCanvasStore((s) => s.future);
  const setProject = useCanvasStore((s) => s.setProject);
  const setViewport = useCanvasStore((s) => s.setViewport);
  const setSnapToGrid = useCanvasStore((s) => s.setSnapToGrid);
  const setHighlightedIds = useCanvasStore((s) => s.setHighlightedIds);
  const select = useCanvasStore((s) => s.select);
  const setSelection = useCanvasStore((s) => s.setSelection);
  const clearSelection = useCanvasStore((s) => s.clearSelection);
  const selectEdge = useCanvasStore((s) => s.selectEdge);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const removeSelectedEdge = useCanvasStore((s) => s.removeSelectedEdge);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const updateNode = useCanvasStore((s) => s.updateNode);
  const markClean = useCanvasStore((s) => s.markClean);
  const getSnapshot = useCanvasStore((s) => s.getSnapshot);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const addNode = useCanvasStore((s) => s.addNode);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const removeEdge = useCanvasStore((s) => s.removeEdge);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
  const moveNodes = useCanvasStore((s) => s.moveNodes);
  const groupSelection = useCanvasStore((s) => s.groupSelection);
  const ungroupSelection = useCanvasStore((s) => s.ungroupSelection);
  const focusNode = useCanvasStore((s) => s.focusNode);
  const focusByJobOrAsset = useCanvasStore((s) => s.focusByJobOrAsset);

  /** Space temporarily flips select ↔ pan (cleared on keyup / blur). */
  const isPanningTool = panMode ? !spaceDown : spaceDown;
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const floatToolbarNodes =
    selectedNodes.length === 1 &&
    !isCompleteGroupSelection(nodes, selectedIds)
      ? selectedNodes
      : [];

  const mentionHighlights = useMemo(() => {
    if (isCompleteGroupSelection(nodes, selectedIds)) return [];
    return computeMentionHighlightIds(nodes, selectedIds, edges);
  }, [edges, nodes, selectedIds]);

  useEffect(() => {
    if (connectDraft) return;
    setHighlightedIds(mentionHighlights);
  }, [mentionHighlights, setHighlightedIds, connectDraft]);

  useEffect(() => {
    setMiniMapOpen(readMinimapOpenPreference(true));
    setSnapToGrid(readSnapPreference(true));
    setGridMode(readGridModePreference("dots"));
    setEdgeVisibility(readEdgeVisibilityPreference("all"));
  }, [setSnapToGrid]);

  useEffect(() => {
    let cancelled = false;
    setProjectReady(false);
    focusApplied.current = false;
    void (async () => {
      const project = await api<ProjectPayload>(`/canvas/projects/${projectId}`);
      if (cancelled) return;
      setProject(project.id, project.title, project.snapshot);
      setProjectReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, setProject]);

  useEffect(() => {
    if (!projectReady || focusApplied.current) return;
    if (viewportSize.width < 2) return;
    const nodeId = focusQuery?.nodeId;
    const jobId = focusQuery?.jobId;
    const assetId = focusQuery?.assetId;
    const toolRaw = focusQuery?.tool?.trim() || "";
    const tool = STUDIO_DEEP_TOOLS.has(toolRaw) ? toolRaw : "";
    if (!nodeId && !jobId && !assetId) return;

    const targetId = resolveFocusTargetId({ nodeId, jobId, assetId });
    if (!targetId) return;

    let ok = false;
    if (nodeId) ok = focusNode(nodeId, viewportSize);
    if (!ok) ok = focusByJobOrAsset({ jobId, assetId }, viewportSize);
    if (!ok) return;

    focusApplied.current = true;
    if (!tool) return;

    // Let selection + layout settle before opening modal tools.
    window.requestAnimationFrame(() => {
      if (tool === "inpaint") {
        openMask(targetId);
        return;
      }
      if (tool === "angle") {
        setAngleNodeId(targetId);
        return;
      }
      if (tool === "to-panorama") {
        setPanoramaNodeId(targetId);
        return;
      }
      if (tool === "trim-video") {
        openAudioTrim(targetId);
        return;
      }
      if (tool === "extract-audio") {
        void (async () => {
          const node = useCanvasStore
            .getState()
            .nodes.find((item) => item.id === targetId);
          if (!node || node.type !== "video") return;
          const url = String(node.data.url ?? "");
          if (!url || url.startsWith("data:")) return;
          try {
            await separateAudioToNode(node.id);
            toast.success("已分离为音频与无声视频");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "分离音频失败",
            );
          }
        })();
        return;
      }
      if (tool === "capture-frame") {
        void (async () => {
          const node = useCanvasStore
            .getState()
            .nodes.find((n) => n.id === targetId);
          if (!node || node.type !== "video") return;
          const url = String(node.data.url ?? "");
          if (!url || url.startsWith("data:")) return;
          try {
            await spawnVideoFrameNode(node, {
              at: "first",
              title: "首帧",
            });
            toast.success("已抽取首帧");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "抽帧失败");
          }
        })();
        return;
      }
      if (
        tool === "crop" ||
        tool === "split" ||
        tool === "view"
      ) {
        openImageTool(targetId, tool);
      }
    });
  }, [
    projectReady,
    viewportSize,
    focusQuery?.nodeId,
    focusQuery?.jobId,
    focusQuery?.assetId,
    focusQuery?.tool,
    focusNode,
    focusByJobOrAsset,
    pushHistory,
    addEdge,
  ]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () =>
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const saveImmediate = useCallback(async () => {
    const snapshot = getSnapshot();
    await api(`/canvas/projects/${projectId}`, {
      method: "PATCH",
      body: { snapshot },
    });
    markClean();
  }, [projectId, getSnapshot, markClean]);

  const save = useMemo(
    () => debounce(saveImmediate, 1000),
    [saveImmediate],
  );

  useEffect(() => {
    if (dirty) save();
    return () => save.cancel();
  }, [dirty, save]);

  useJobLifecycle({
    enabled: projectReady,
    getBusyJobIds: () =>
      useCanvasStore
        .getState()
        .nodes.filter((node) => {
          const status = String(node.data.status ?? "");
          const jobId = String(node.data.jobId ?? "").trim();
          return isBusyStatus(status) && Boolean(jobId);
        })
        .map((node) => String(node.data.jobId).trim()),
    onCompleted: (payload) => {
      handleCanvasJobCompleted(payload);
    },
    onFailed: (payload) => {
      handleCanvasJobFailed(payload);
    },
    onAssetUpdated: (payload) => {
      const asset = payload.asset;
      if (!asset?.id || !asset.url) return;
      const state = useCanvasStore.getState();
      for (const node of state.nodes) {
        if (!mediaKindOf(node)) continue;
        const byAsset = node.data.assetId === asset.id;
        const byJob = payload.jobId && node.data.jobId === payload.jobId;
        if (!byAsset && !byJob) continue;
        const busy = isBusyStatus(String(node.data.status ?? ""));
        updateNodeData(node.id, {
          url: String(asset.url),
          assetId: String(asset.id),
          ...(busy ? { status: "succeeded", error: "" } : {}),
        });
      }
    },
  });

  const ingestFiles = useCallback(
    async (files: FileList | File[], at?: { x: number; y: number }) => {
      const list = Array.from(files).filter(
        (f) =>
          f.type.startsWith("image/") ||
          f.type.startsWith("video/") ||
          f.type.startsWith("audio/"),
      );
      if (!list.length) return;
      pushHistory();
      const vp = useCanvasStore.getState().viewport;
      const baseX = at?.x ?? (-vp.x + 280) / vp.zoom;
      const baseY = at?.y ?? (-vp.y + 160) / vp.zoom;
      const ids = await Promise.all(
        list.map((file, index) =>
          uploadFileToNewNode(
            file,
            { x: baseX + index * 36, y: baseY + index * 36 },
            { history: false },
          ).catch(() => null),
        ),
      );
      const created = ids.filter((id): id is string => Boolean(id));
      if (created.length) setSelection(created);
    },
    [pushHistory, setSelection],
  );

  const pasteInternal = useCallback(() => {
    const srcList = clipboard.current.nodes;
    if (!srcList.length) return false;
    pushHistory();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const src of srcList) {
      const box = nodeBox(src);
      minX = Math.min(minX, box.x);
      minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.width);
      maxY = Math.max(maxY, box.y + box.height);
    }
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    const centerX = rect
      ? (-vp.x + rect.width / 2) / vp.zoom
      : (minX + maxX) / 2 + 36;
    const centerY = rect
      ? (-vp.y + rect.height / 2) / vp.zoom
      : (minY + maxY) / 2 + 36;
    const ox = centerX - (minX + maxX) / 2;
    const oy = centerY - (minY + maxY) / 2;
    const idMap = new Map<string, string>();
    const created: string[] = [];
    const groupCache = new Map<string, string>();
    for (const src of srcList) {
      const id = addNode(src.type, { x: src.x + ox, y: src.y + oy });
      idMap.set(src.id, id);
      updateNodeData(
        id,
        prepareCopiedData(src.data, copiedGroupId(srcList, src, groupCache)),
      );
      useCanvasStore.getState().updateNode(id, {
        width: src.width,
        height: src.height,
      });
      created.push(id);
    }
    for (const edge of clipboard.current.edges) {
      const source = idMap.get(edge.source);
      const target = idMap.get(edge.target);
      if (source && target) addEdge(source, target);
    }
    setSelection(created);
    return true;
  }, [addEdge, addNode, pushHistory, setSelection, updateNodeData]);

  const pasteSystemClipboard = useCallback(async () => {
    if (!navigator.clipboard) return;
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    const at = rect
      ? {
          x: (-vp.x + rect.width * 0.35) / vp.zoom,
          y: (-vp.y + rect.height * 0.3) / vp.zoom,
        }
      : undefined;
    try {
      if (typeof navigator.clipboard.read === "function") {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            const file = new File([blob], "clipboard-image.png", {
              type: imageType,
            });
            await ingestFiles([file], at);
            return;
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      pushHistory();
      const id = addNode("text", at);
      updateNodeData(id, { text: text.trim() });
      setSelection([id]);
    } catch {
      /* permission denied or empty */
    }
  }, [addNode, ingestFiles, pushHistory, setSelection, updateNodeData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const ignoreBoard =
        typing || Boolean(target.closest("[data-canvas-shortcuts-ignore]"));

      if (e.code === "Space" && !typing) {
        if (!ignoreBoard && !e.repeat) {
          setSpaceDown(true);
          e.preventDefault();
        }
      }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (ignoreBoard) {
        if (e.key === "Escape") {
          clearSelection();
          setCreateMenu(null);
          setNodeMenu(null);
          setEditingImageId(null);
          setShortcutsOpen(false);
          useCanvasRightPanelStore.getState().close();
        }
        return;
      }

      if (mod && e.key.toLowerCase() === "d") {
        const ids = useCanvasStore.getState().selectedIds;
        if (ids.length) {
          e.preventDefault();
          pushHistory();
          duplicateNodes(ids);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelection(useCanvasStore.getState().nodes.map((n) => n.id));
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        const state = useCanvasStore.getState();
        const idSet = new Set(state.selectedIds);
        const picked = state.nodes.filter((n) => idSet.has(n.id));
        if (picked.length) {
          clipboard.current = {
            nodes: picked.map((n) => ({ ...n, data: { ...n.data } })),
            edges: state.edges.filter(
              (edge) => idSet.has(edge.source) && idSet.has(edge.target),
            ),
          };
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (!pasteInternal()) void pasteSystemClipboard();
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        pushHistory();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }

      if (
        !mod &&
        (e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown")
      ) {
        const state = useCanvasStore.getState();
        const ids = state.selectedIds;
        if (!ids.length) return;
        e.preventDefault();
        if (!e.repeat) pushHistory();
        const step = e.shiftKey
          ? state.snapToGrid
            ? CANVAS_GRID * 2
            : 10
          : state.snapToGrid
            ? CANVAS_GRID
            : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        moveNodes(ids, dx, dy);
        const live = useCanvasStore.getState().nodes;
        const next = applyGroupDrop(live, ids);
        if (next !== live) {
          useCanvasStore.setState({ nodes: next, dirty: true });
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const state = useCanvasStore.getState();
        if (state.selectedEdgeId) {
          pushHistory();
          removeSelectedEdge();
          return;
        }
        const ids = state.selectedIds;
        if (ids.length) {
          pushHistory();
          removeNodes(ids);
        }
      }
      if (e.key === "Escape") {
        clearSelection();
        setCreateMenu(null);
        setNodeMenu(null);
        setEditingImageId(null);
        setMarquee(null);
        marqueeRef.current = null;
        setShortcutsOpen(false);
        setConnectDraft(null);
        connectSourcesRef.current = [];
        useCanvasRightPanelStore.getState().close();
        useColorTagFocusStore.getState().clear();
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (e.key === "0" && !mod) {
        e.preventDefault();
        fitToContent();
        return;
      }
      if (e.key === "1" && !mod) {
        e.preventDefault();
        fitSelection();
        return;
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomAt(Math.min(5, useCanvasStore.getState().viewport.zoom * 1.1));
        return;
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomAt(Math.max(0.05, useCanvasStore.getState().viewport.zoom * 0.9));
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    const onBlur = () => {
      setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    clearSelection,
    duplicateNodes,
    groupSelection,
    moveNodes,
    pasteInternal,
    pasteSystemClipboard,
    pushHistory,
    redo,
    removeNodes,
    removeSelectedEdge,
    setSelection,
    undo,
    ungroupSelection,
  ]);

  function zoomAt(nextZoom: number, mx?: number, my?: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    if (!rect) {
      setViewport({ zoom: nextZoom });
      return;
    }
    const cx = mx ?? rect.width / 2;
    const cy = my ?? rect.height / 2;
    const wx = (cx - vp.x) / vp.zoom;
    const wy = (cy - vp.y) / vp.zoom;
    setViewport({
      zoom: nextZoom,
      x: cx - wx * nextZoom,
      y: cy - wy * nextZoom,
    });
  }

  function onWheel(e: React.WheelEvent) {
    if (isCanvasOverlayTarget(e.target)) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const vp = useCanvasStore.getState().viewport;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.min(5, Math.max(0.05, vp.zoom * zoomFactor));
    zoomAt(nextZoom, mx, my);
  }

  function fitNodes(list: CanvasNode[]) {
    const el = containerRef.current;
    if (!el) return;
    if (!list.length) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    const bounds = selectionBounds(list);
    if (!bounds) return;
    const pad = 80;
    const bw = bounds.w + pad * 2;
    const bh = bounds.h + pad * 2;
    const zoom = Math.min(
      2.5,
      Math.max(0.05, Math.min(el.clientWidth / bw, el.clientHeight / bh)),
    );
    const x = el.clientWidth / 2 - (bounds.x + bounds.w / 2) * zoom;
    const y = el.clientHeight / 2 - (bounds.y + bounds.h / 2) * zoom;
    setViewport({ x, y, zoom });
  }

  function fitToContent() {
    fitNodes(useCanvasStore.getState().nodes);
  }

  function fitSelection() {
    const state = useCanvasStore.getState();
    const picked = state.nodes.filter((node) =>
      state.selectedIds.includes(node.id),
    );
    fitNodes(picked.length ? picked : state.nodes);
  }

  function clientToLocal(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function finishMarquee() {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m) return;
    const left = Math.min(m.x0, m.x1);
    const top = Math.min(m.y0, m.y1);
    const right = Math.max(m.x0, m.x1);
    const bottom = Math.max(m.y0, m.y1);
    if (Math.abs(right - left) < 3 && Math.abs(bottom - top) < 3) {
      if (!marqueeAdditive.current) clearSelection();
      return;
    }
    const world = (() => {
      const vp = useCanvasStore.getState().viewport;
      return {
        x: (left - vp.x) / vp.zoom,
        y: (top - vp.y) / vp.zoom,
        w: (right - left) / vp.zoom,
        h: (bottom - top) / vp.zoom,
      };
    })();
    const allNodes = useCanvasStore.getState().nodes;
    const hit = allNodes
      .filter((n) => !isHiddenBatchChild(n, allNodes))
      .filter((n) => {
        const box = nodeBox(n);
        return rectsIntersect(world, {
          x: box.x,
          y: box.y,
          w: box.width,
          h: box.height,
        });
      })
      .map((n) => n.id);
    if (marqueeAdditive.current) {
      const merged = new Set([
        ...useCanvasStore.getState().selectedIds,
        ...hit,
      ]);
      setSelection([...merged]);
    } else {
      setSelection(hit);
    }
  }

  function closeMenus() {
    setCreateMenu(null);
    setNodeMenu(null);
  }

  function onPointerDownBoard(e: React.PointerEvent) {
    closeMenus();
    const wantPan =
      e.button === 1 ||
      isPanningTool ||
      (e.button === 0 && e.target === e.currentTarget && panMode);

    if (
      wantPan ||
      (e.button === 0 && e.target === e.currentTarget && spaceDown)
    ) {
      panning.current = true;
      setIsPanning(true);
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        vx: useCanvasStore.getState().viewport.x,
        vy: useCanvasStore.getState().viewport.y,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (e.button === 0 && e.target === e.currentTarget && !panMode) {
      const local = clientToLocal(e.clientX, e.clientY);
      marqueeAdditive.current = e.shiftKey;
      const next = { x0: local.x, y0: local.y, x1: local.x, y1: local.y };
      marqueeRef.current = next;
      setMarquee(next);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  }

  function onPointerMoveBoard(e: React.PointerEvent) {
    if (connectSourcesRef.current.length) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const vp = useCanvasStore.getState().viewport;
        const wx = (e.clientX - rect.left - vp.x) / vp.zoom;
        const wy = (e.clientY - rect.top - vp.y) / vp.zoom;
        const sourceIds = connectSourcesRef.current;
        setConnectDraft({
          sourceId: sourceIds[0]!,
          sourceIds: sourceIds.length > 1 ? sourceIds : undefined,
          x: wx,
          y: wy,
        });
        const live = useCanvasStore.getState().nodes;
        const sources = sourceIds
          .map((id) => live.find((n) => n.id === id))
          .filter((n): n is CanvasNode => Boolean(n));
        const hit = hitNodeAt(
          live.filter((n) => !isHiddenBatchChild(n, live)),
          wx,
          wy,
        );
        if (hit && !sourceIds.includes(hit.id)) {
          setHighlightedIds([hit.id]);
        } else {
          setHighlightedIds([]);
        }
      }
      return;
    }
    if (marqueeRef.current) {
      const local = clientToLocal(e.clientX, e.clientY);
      const next = { ...marqueeRef.current, x1: local.x, y1: local.y };
      marqueeRef.current = next;
      setMarquee(next);
      return;
    }
    if (panning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setViewport({
        x: panStart.current.vx + dx,
        y: panStart.current.vy + dy,
      });
      return;
    }
    if (drag.current) {
      if (!dragPushed.current) {
        pushHistory();
        dragPushed.current = true;
      }
      const zoom = useCanvasStore.getState().viewport.zoom;
      const dx = (e.clientX - drag.current.ox) / zoom;
      const dy = (e.clientY - drag.current.oy) / zoom;
      const state = useCanvasStore.getState();
      const movedIds = drag.current.ids;
      const next = state.nodes.map((n) => {
        const origin = drag.current?.origins[n.id];
        if (!origin) return n;
        return { ...n, x: origin.x + dx, y: origin.y + dy };
      });
      useCanvasStore.setState({ nodes: next, dirty: true });
      const target = findGroupDropTarget(next, movedIds);
      setDropTargetGid((prev) => (prev === target ? prev : target));
    }
  }

  function onPointerUpBoard(e: React.PointerEvent) {
    if (connectSourcesRef.current.length) {
      const sourceIds = [...connectSourcesRef.current];
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const vp = useCanvasStore.getState().viewport;
        const allNodes = useCanvasStore.getState().nodes;
        const liveNodes = allNodes.filter(
          (n) => !isHiddenBatchChild(n, allNodes),
        );
        const wx = (localX - vp.x) / vp.zoom;
        const wy = (localY - vp.y) / vp.zoom;
        const hit = hitNodeAt(liveNodes, wx, wy);
        const sources = sourceIds
          .map((id) => liveNodes.find((n) => n.id === id))
          .filter((n): n is CanvasNode => Boolean(n));

        if (hit && !sourceIds.includes(hit.id)) {
          pushHistory();
          let linked = 0;
          for (const source of sources) {
            if (addEdge(source.id, hit.id)) linked += 1;
          }
          if (sourceIds.length > 1 && linked) {
            toast.success(`已批量连接 ${linked} 条线`);
          }
        } else if (!hit) {
          const preferred =
            sourceIds.length > 1
              ? preferredConnectTargetType(sources)
              : sources[0]?.type === "panorama"
                ? "director"
                : sources[0]?.type === "image" ||
                    sources[0]?.type === "text" ||
                    sources[0]?.type === "video" ||
                    sources[0]?.type === "audio"
                  ? "prompt"
                  : undefined;
          setCreateMenu({
            kind: "connect",
            x: localX,
            y: localY,
            worldX: wx,
            worldY: wy,
            sourceId: sourceIds[0],
            sourceIds: sourceIds.length > 1 ? sourceIds : undefined,
            preferredType: preferred,
          });
        }
      }
      connectSourcesRef.current = [];
      setConnectDraft(null);
    }
    if (marqueeRef.current) {
      finishMarquee();
    }
    if (drag.current && useCanvasStore.getState().snapToGrid) {
      const ids = new Set(drag.current.ids);
      const next = useCanvasStore.getState().nodes.map((n) => {
        if (!ids.has(n.id)) return n;
        const p = snapPoint(n.x, n.y);
        return { ...n, x: p.x, y: p.y };
      });
      useCanvasStore.setState({ nodes: next, dirty: true });
    }
    if (drag.current) {
      const moved = drag.current.ids;
      const origins = drag.current.origins;
      if (dragPushed.current) {
        useCanvasStore.getState().raiseNodes(moved);
      }
      const live = useCanvasStore.getState().nodes;
      const actuallyMoved = moved.some((id) => {
        const node = live.find((item) => item.id === id);
        const origin = origins[id];
        return (
          node != null &&
          origin != null &&
          (Math.abs(node.x - origin.x) > 0.5 ||
            Math.abs(node.y - origin.y) > 0.5)
        );
      });
      if (actuallyMoved) {
        const next = applyGroupDrop(live, moved);
        if (next !== live) {
          useCanvasStore.setState({ nodes: next, dirty: true });
        }
      } else if (drag.current.clickToNodeId) {
        setSelection([drag.current.clickToNodeId]);
      }
    }
    panning.current = false;
    setIsPanning(false);
    drag.current = null;
    dragPushed.current = false;
    setDropTargetGid(null);
    setIsNodeDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onNodePointerDown(e: React.PointerEvent, node: CanvasNode) {
    if (isPanningTool || e.button === 1) return;
    // Prevent browser native media drag (ghost / drop-as-copy).
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    const additive = e.shiftKey;
    const state = useCanvasStore.getState();
    const already = state.selectedIds.includes(node.id);
    const gid = groupIdOf(node);
    const groupSelected =
      Boolean(gid) &&
      isCompleteGroupSelection(state.nodes, state.selectedIds, gid);

    let dragIds: string[];
    let clickToNodeId: string | null = null;
    // Alt: drag this node alone (leave group on drop) — not a duplicate.
    if (e.altKey) {
      setSelection([node.id]);
      dragIds = [node.id];
    } else if (additive) {
      select(node.id, { additive: true });
      const ids = useCanvasStore.getState().selectedIds;
      if (!ids.includes(node.id)) return;
      dragIds = ids;
    } else if (groupSelected && already) {
      // Keep the group selected for a potential drag; plain click shrinks to this node.
      dragIds = state.selectedIds;
      clickToNodeId = node.id;
    } else {
      setSelection([node.id]);
      dragIds = [node.id];
    }

    dragIds = expandIdsWithBatch(useCanvasStore.getState().nodes, dragIds);

    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of dragIds) {
      const n = useCanvasStore.getState().nodes.find((x) => x.id === id);
      if (n) origins[id] = { x: n.x, y: n.y };
    }
    drag.current = {
      ids: dragIds,
      ox: e.clientX,
      oy: e.clientY,
      origins,
      clickToNodeId,
    };
    setIsNodeDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onConnectStart(nodeId: string, e: React.PointerEvent) {
    connectSourcesRef.current = [nodeId];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const wy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
    setConnectDraft({ sourceId: nodeId, x: wx, y: wy });
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onSelectionConnectStart(e: React.PointerEvent) {
    const ids = useCanvasStore.getState().selectedIds;
    if (ids.length < 2) return;
    connectSourcesRef.current = [...ids];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const wy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
    setConnectDraft({
      sourceId: ids[0]!,
      sourceIds: ids,
      x: wx,
      y: wy,
    });
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onBoardContextMenu(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    closeMenus();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCreateMenu({
      kind: "blank",
      x: mx,
      y: my,
      worldX: (mx - viewport.x) / viewport.zoom,
      worldY: (my - viewport.y) / viewport.zoom,
    });
  }

  function onBoardDoubleClick(e: React.MouseEvent) {
    // Node drag uses setPointerCapture on the board, so dblclick can retarget
    // here even when the user double-clicked a node — hit-test before opening.
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const vp = useCanvasStore.getState().viewport;
    const allNodes = useCanvasStore.getState().nodes;
    const live = allNodes.filter((n) => !isHiddenBatchChild(n, allNodes));
    const wx = (mx - vp.x) / vp.zoom;
    const wy = (my - vp.y) / vp.zoom;
    if (hitNodeAt(live, wx, wy)) return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    closeMenus();
    setCreateMenu({
      kind: "blank",
      x: mx,
      y: my,
      worldX: wx,
      worldY: wy,
    });
  }

  function onNodeContextMenu(e: React.MouseEvent, node: CanvasNode) {
    e.preventDefault();
    e.stopPropagation();
    closeMenus();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const state = useCanvasStore.getState();
    if (!state.selectedIds.includes(node.id)) {
      setSelection([node.id]);
    }
    const selected = useCanvasStore
      .getState()
      .nodes.filter((n) =>
        useCanvasStore.getState().selectedIds.includes(n.id),
      );
    const canGroup = selected.length >= 2;
    const canUngroup = selected.some((n) => groupIdOf(n));
    setNodeMenu({
      kind: "node",
      x: mx,
      y: my,
      nodeId: node.id,
      nodeType: node.type,
      hasMedia: Boolean(
        String(node.data.url ?? "") &&
          !String(node.data.url ?? "").startsWith("data:"),
      ),
      canGroup,
      canUngroup,
    });
  }

  function handleCreateFromMenu(type: CanvasNodeType) {
    const menu = createMenuRef.current;
    if (!menu) return;
    createMenuRef.current = null;
    setCreateMenu(null);
    pushHistory();
    const id = addNode(type, {
      x: menu.worldX,
      y: menu.worldY,
    });
    if (menu.kind === "connect") {
      const sourceIds =
        menu.sourceIds?.length
          ? menu.sourceIds
          : menu.sourceId
            ? [menu.sourceId]
            : [];
      const sourceNodes = sourceIds
        .map((sid) => nodes.find((n) => n.id === sid))
        .filter((n): n is CanvasNode => Boolean(n));

      for (const source of sourceNodes) {
        addEdge(source.id, id);
      }

      // Prefill prompt refs from connected media / text sources.
      if (type === "prompt") {
        const mediaSource = sourceNodes.find(
          (source) =>
            source.type === "image" ||
            source.type === "video" ||
            source.type === "panorama" ||
            source.type === "audio",
        );
        if (mediaSource) {
          const assetId = String(mediaSource.data.assetId ?? "");
          const refUrl = String(mediaSource.data.url ?? "");
          const allAssetIds = sourceNodes
            .filter(
              (s) =>
                s.type === "image" ||
                s.type === "video" ||
                s.type === "panorama" ||
                s.type === "audio",
            )
            .flatMap((s) => {
              const aid = String(s.data.assetId ?? "");
              return aid ? [aid, s.id] : [s.id];
            });
          const allUrls = sourceNodes
            .filter(
              (s) =>
                s.type === "image" ||
                s.type === "video" ||
                s.type === "panorama" ||
                s.type === "audio",
            )
            .map((s) => String(s.data.url ?? ""))
            .filter((u) => u && !u.startsWith("data:"));
          updateNodeData(id, {
            outputKind:
              mediaSource.type === "audio"
                ? "video"
                : mediaSource.type === "panorama"
                  ? "panorama"
                  : mediaSource.type === "video"
                    ? "video"
                    : "image",
            referenceIds: [
              ...new Set(
                allAssetIds.length
                  ? allAssetIds
                  : assetId
                    ? [assetId, mediaSource.id]
                    : [mediaSource.id],
              ),
            ],
            referenceUrls: [
              ...new Set(
                allUrls.length
                  ? allUrls
                  : refUrl && !refUrl.startsWith("data:")
                    ? [refUrl]
                    : [],
              ),
            ],
          });
        }
        const textSource = sourceNodes.find((s) => s.type === "text");
        if (textSource) {
          updateNodeData(id, {
            prompt: String(textSource.data.text ?? "").trim(),
          });
        }
      }

      if (type === "video" && sourceNodes.length) {
        const images = sourceNodes.filter(
          (s) => s.type === "image" || s.type === "panorama",
        );
        if (images[0]) {
          updateNodeData(id, {
            firstFrameNodeId: images[0].id,
            ...(images[1] ? { lastFrameNodeId: images[1].id } : {}),
          });
        }
      }
    }
    setSelection([id]);
  }

  function openUploadAt(world: { x: number; y: number }) {
    uploadAtRef.current = world;
    uploadRef.current?.click();
  }

  function toggleMiniMap() {
    setMiniMapOpen((v) => {
      const next = !v;
      writeMinimapOpenPreference(next);
      return next;
    });
  }

  function toggleSnap() {
    setSnapToGrid(!snapToGrid);
    writeSnapPreference(!snapToGrid);
  }

  function setGridModePref(mode: CanvasGridMode) {
    setGridMode(mode);
    writeGridModePreference(mode);
  }

  function clearCanvas() {
    if (!nodes.length) return;
    if (!window.confirm("确定清空画布上的全部节点？此操作可撤销。")) return;
    pushHistory();
    removeNodes(nodes.map((n) => n.id));
    clearSelection();
  }

  function clearHoverLeaveTimer() {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current);
      hoverLeaveTimer.current = null;
    }
  }

  function onNodeHoverEnter(id: string) {
    clearHoverLeaveTimer();
    setHoveredNodeId(id);
  }

  function onNodeHoverLeave() {
    clearHoverLeaveTimer();
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredNodeId(null);
    }, 220);
  }

  async function insertAssetAtCenter(
    asset: {
      id: string;
      url: string;
      kind: string;
      meta?: Record<string, unknown> | null;
      originalName?: string | null;
    },
    opts?: { offset?: number; history?: boolean },
  ) {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    const offset = opts?.offset ?? 0;
    const at = rect
      ? {
          x: (-vp.x + rect.width / 2) / vp.zoom - 120 + offset * 36,
          y: (-vp.y + rect.height / 2) / vp.zoom - 90 + offset * 28,
        }
      : undefined;
    if (opts?.history !== false) pushHistory();
    let type = nodeTypeForAssetKind(asset.kind);
    if (type === "image") {
      type = await probeImageUrlType(asset.url);
    }
    const id = addNode(type, at);
    const fromAsset = originalNameFromAsset(asset);
    updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
      ...mediaNamePatch(fromAsset),
      ...(type === "panorama" ? { projection: "equirectangular" } : {}),
    });
    if (type === "panorama") notePanoramaAspect(id, asset.url);
    else if (type === "image" || type === "video") {
      void frameNodeToMedia(id, asset.url, type);
    }
    setSelection([id]);
    return id;
  }

  async function insertPickedAssets(
    assets: {
      id: string;
      url: string;
      kind: string;
      meta?: Record<string, unknown> | null;
      originalName?: string | null;
    }[],
  ) {
    if (!assets.length) return;
    pushHistory();
    const ids: string[] = [];
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      if (!asset) continue;
      const id = await insertAssetAtCenter(asset, {
        offset: index,
        history: false,
      });
      ids.push(id);
    }
    if (ids.length) setSelection(ids);
    setAssetPickerOpen(false);
  }

  function openImageTool(nodeId: string, mode: ImageToolMode) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    if (!node || !url || url.startsWith("data:")) {
      toast.message("请先放入图片");
      return;
    }
    if (node.type !== "image" && node.type !== "panorama") return;
    setImageTool({ nodeId, url, mode });
  }

  async function commitImageTool(pieces: RasterPiece[]) {
    const session = imageTool;
    if (!session) return;
    const node = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === session.nodeId);
    if (!node) {
      toast.error("节点已不存在");
      setImageTool(null);
      return;
    }
    await commitImagePieces(node, pieces);
    toast.success(
      pieces.length > 1 ? `已切出 ${pieces.length} 张图` : "已生成新图像节点",
    );
    setImageTool(null);
  }

  async function handleExtractAudio() {
    const id = nodeMenu?.nodeId;
    setNodeMenu(null);
    if (!id) return;
    const node = useCanvasStore.getState().nodes.find((item) => item.id === id);
    if (!node || node.type !== "video") return;
    const url = String(node.data.url ?? "");
    if (!url || url.startsWith("data:")) return;
    try {
      await separateAudioToNode(node.id);
      toast.success("已分离为音频与无声视频");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分离音频失败");
    }
  }

  function openInfo(nodeId: string) {
    setInfoNodeId(nodeId);
    setNodeMenu(null);
  }

  function openAudioTrim(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    setNodeMenu(null);
    if (
      !node ||
      (node.type !== "audio" && node.type !== "video") ||
      !url ||
      url.startsWith("data:")
    ) {
      toast.message("请先放入音频或视频");
      return;
    }
    setAudioTrim({ nodeId, url });
  }

  function openFramePick(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    setNodeMenu(null);
    if (!node || node.type !== "video" || !url || url.startsWith("data:")) {
      toast.message("请先放入视频");
      return;
    }
    setFramePick({
      nodeId,
      url,
      initialTime: getPlaybackTime(nodeId),
    });
  }

  async function commitFramePick(time: number) {
    const session = framePick;
    if (!session || framePickBusy) return;
    const node = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === session.nodeId);
    if (!node || node.type !== "video") {
      toast.error("节点已不存在");
      setFramePick(null);
      return;
    }
    setFramePickBusy(true);
    try {
      await spawnVideoFrameNode(node, {
        at: "current",
        currentTime: time,
        title: "抽帧",
      });
      toast.success("已抽取帧并创建图像节点");
      setFramePick(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "抽帧失败");
    } finally {
      setFramePickBusy(false);
    }
  }

  function openMask(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    setNodeMenu(null);
    if (!node || node.type !== "image" || !url || url.startsWith("data:")) {
      toast.message("请先放入图片");
      return;
    }
    setMaskEdit({ nodeId, url });
  }

  function openRedraw(nodeId: string) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    setNodeMenu(null);
    if (!node || node.type !== "image" || !url || url.startsWith("data:")) {
      toast.message("请先放入图片");
      return;
    }
    setRedrawEdit({ nodeId, url });
  }

  function openStudioImage(
    nodeId: string,
    setter: (next: { nodeId: string; url: string } | null) => void,
    opts?: { allowPanorama?: boolean },
  ) {
    const node = useCanvasStore.getState().nodes.find((item) => item.id === nodeId);
    const url = String(node?.data.url ?? "");
    setNodeMenu(null);
    const typeOk =
      node?.type === "image" ||
      (opts?.allowPanorama && node?.type === "panorama");
    if (!node || !typeOk || !url || url.startsWith("data:")) {
      toast.message("请先放入图片");
      return;
    }
    setter({ nodeId, url });
  }

  function studioNodeTitle(nodeId: string | null | undefined) {
    if (!nodeId) return undefined;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node) return undefined;
    return nodeTitleLabel(node.type, node.data);
  }

  async function commitAudioTrim(range: { start: number; end: number }) {
    const session = audioTrim;
    if (!session || audioTrimBusy) return;
    const node = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === session.nodeId);
    if (!node) {
      toast.error("节点已不存在");
      setAudioTrim(null);
      return;
    }
    const asVideo = node.type === "video";
    setAudioTrimBusy(true);
    try {
      pushHistory();
      if (asVideo) {
        const file = await trimVideoToFile(
          session.url,
          range.start,
          range.end,
          String(node.data.fileName ?? node.data.title ?? "视频"),
        );
        const videoId = await uploadFileToNewNode(
          file,
          {
            x: node.x + (node.width ?? 420) + 40,
            y: node.y,
          },
          {
            history: false,
            preferredType: "video",
            title: "剪辑片段",
          },
        );
        addEdge(node.id, videoId);
        setSelection([videoId]);
        setAudioTrim(null);
        toast.success("已剪辑并创建视频节点");
        return;
      }

      const file = await trimMediaToFile(session.url, range.start, range.end);
      const audioId = await uploadFileToNewNode(
        file,
        {
          x: node.x + (node.width ?? 280) + 40,
          y: node.y + 28,
        },
        {
          history: false,
          preferredType: "audio",
          title: "截取音频",
        },
      );
      addEdge(node.id, audioId);
      setSelection([audioId]);
      setAudioTrim(null);
      toast.success("已截取并创建音频节点");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : asVideo
            ? "剪辑失败"
            : "截取失败",
      );
    } finally {
      setAudioTrimBusy(false);
    }
  }

  async function commitMask(payload: {
    prompt: string;
    blob: Blob;
    modelId: string;
    resolution?: string;
    ratio?: string;
  }) {
    const session = maskEdit;
    if (!session) return;
    await spawnMarkedImageEdit({
      sourceNodeId: session.nodeId,
      blob: payload.blob,
      prompt: payload.prompt,
      operation: "inpaint",
      projectId,
      modelId: payload.modelId,
      resolution: payload.resolution,
      ratio: payload.ratio,
      markedTitle: "涂抹参考",
      toastLabel: "正在提交局部重绘…",
    });
    setMaskEdit(null);
  }

  async function commitRedraw(payload: {
    prompt: string;
    blob: Blob;
    modelId: string;
    resolution?: string;
    ratio?: string;
    referenceNodeIds: string[];
    referenceFiles: File[];
  }) {
    const session = redrawEdit;
    if (!session) return;
    const extraReferenceAssetIds: string[] = [];
    const extraReferenceUrls: string[] = [];
    const storeNodes = useCanvasStore.getState().nodes;
    for (const id of payload.referenceNodeIds) {
      const node = storeNodes.find((item) => item.id === id);
      const assetId = String(node?.data.assetId ?? "");
      const refUrl = String(node?.data.url ?? "");
      if (assetId) extraReferenceAssetIds.push(assetId);
      if (refUrl && !refUrl.startsWith("data:")) extraReferenceUrls.push(refUrl);
    }
    for (const file of payload.referenceFiles) {
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      if (asset.id) extraReferenceAssetIds.push(asset.id);
      if (asset.url) extraReferenceUrls.push(asset.url);
    }
    await spawnMarkedImageEdit({
      sourceNodeId: session.nodeId,
      blob: payload.blob,
      prompt: payload.prompt,
      operation: "inpaint",
      projectId,
      modelId: payload.modelId,
      resolution: payload.resolution,
      ratio: payload.ratio,
      extraReferenceAssetIds,
      extraReferenceUrls,
      markedTitle: "重绘参考",
      toastLabel: "正在提交重绘…",
    });
    setRedrawEdit(null);
  }

  const chromeBusy = isPanningTool || isNodeDragging || isNodeResizing;
  const selectedMedia =
    selectedNodes.length === 1 ? mediaKindOf(selectedNodes[0]) : null;
  const genCapable =
    selectedMedia === "image" ||
    selectedMedia === "video" ||
    selectedMedia === "panorama" ||
    selectedMedia === "audio";
  const selectedStatus = String(selectedNodes[0]?.data.status ?? "idle");
  const selectedUploading =
    selectedStatus === "queued" || selectedStatus === "running";
  const showGenPanel = genCapable && !chromeBusy && !selectedUploading;

  const gridSize = (snapToGrid ? 24 : 48) * viewport.zoom;
  const marqueeStyle = marquee
    ? {
        left: Math.min(marquee.x0, marquee.x1),
        top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
      }
    : null;

  return (
    <div className="joy-canvas-board flex h-full min-h-[480px] overflow-hidden">
      <div className="relative h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <CanvasTopBar
        projectId={projectId}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onImport={() => uploadRef.current?.click()}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onFocusNode={(id) => {
          focusNode(id, viewportSize);
        }}
      />
      <CanvasRightPanel
        projectId={projectId}
        nodes={nodes}
        selectedIds={selectedIds}
        onFocusNode={(id) => {
          focusNode(id, viewportSize);
        }}
        onFocusGroup={(memberIds) => {
          if (memberIds.length < 2) return;
          setSelection(memberIds);
          const picked = useCanvasStore
            .getState()
            .nodes.filter((n) => memberIds.includes(n.id));
          fitNodes(picked);
        }}
        onFocusJob={({ jobId, assetId, nodeId }) => {
          let ok = false;
          if (nodeId) ok = focusNode(nodeId, viewportSize);
          if (!ok) ok = focusByJobOrAsset({ jobId, assetId }, viewportSize);
        }}
      />
      <CanvasAgentDrawer projectId={projectId} />
      <CanvasToolbar
        panMode={panMode}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        snapToGrid={snapToGrid}
        gridMode={gridMode}
        selectedCount={selectedIds.length}
        onPanModeChange={setPanMode}
        onUndo={undo}
        onRedo={redo}
        onToggleSnap={toggleSnap}
        onGridModeChange={setGridModePref}
        onAddNode={(type) => {
          pushHistory();
          addNode(type);
        }}
        onAddGroup={() => {
          if (selectedIds.length < 2) return;
          pushHistory();
          groupSelection();
        }}
        onDeleteSelected={() => {
          if (!selectedIds.length) return;
          pushHistory();
          removeNodes(selectedIds);
        }}
        onClearCanvas={clearCanvas}
      />
      <CanvasCreateRail
        onAddNode={(type) => {
          pushHistory();
          addNode(type);
        }}
        onOpenAssets={() => setAssetPickerOpen(true)}
      />
      <CanvasDock
        zoom={viewport.zoom}
        miniMapOpen={miniMapOpen}
        shortcutsOpen={shortcutsOpen}
        edgeVisibility={edgeVisibility}
        onZoomChange={(z) => zoomAt(Math.min(5, Math.max(0.05, z)))}
        onFit={fitToContent}
        onToggleMiniMap={toggleMiniMap}
        onToggleShortcuts={() => setShortcutsOpen((v) => !v)}
        onToggleEdgeVisibility={() => {
          setEdgeVisibility((prev) => {
            const next = prev === "all" ? "focus" : "all";
            writeEdgeVisibilityPreference(next);
            return next;
          });
        }}
      />

      <CanvasShortcutsHelp
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      <CanvasAssetDialog
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        onConfirm={(assets) => void insertPickedAssets(assets)}
      />

      {miniMapOpen ? (
        <CanvasMinimap
          nodes={nodes}
          viewport={viewport}
          viewportSize={viewportSize}
          onViewportChange={setViewport}
        />
      ) : null}

      {selectedNodes.length > 1 && !chromeBusy ? (
        <MultiSelectToolbar
          nodes={selectedNodes}
          viewport={viewport}
          viewportSize={viewportSize}
        />
      ) : null}

      {floatToolbarNodes.length === 1 && !chromeBusy ? (
        <div
          onMouseEnter={clearHoverLeaveTimer}
          onMouseLeave={onNodeHoverLeave}
        >
          <NodeFloatToolbar
            nodes={floatToolbarNodes}
            viewport={viewport}
            onOpenDirector={(id) => setDirectorId(id)}
            onOpenImageTool={(mode) => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openImageTool(id, mode);
            }}
            onOpenAngle={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setAngleNodeId(id);
            }}
            onOpenReversePrompt={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setReversePromptNodeId(id);
            }}
            onOpenImageFx={(mode) => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setImageFx({ nodeId: id, mode });
            }}
            onOpenAudioTrim={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openAudioTrim(id);
            }}
            onOpenFramePick={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openFramePick(id);
            }}
            onOpenMask={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openMask(id);
            }}
            onOpenRedraw={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openRedraw(id);
            }}
            onOpenOutpaint={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openStudioImage(id, setOutpaintEdit);
            }}
            onOpenScribble={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openStudioImage(id, setScribbleEdit);
            }}
            onOpenLighting={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openStudioImage(id, setLightingEdit);
            }}
            onOpenRotate={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openStudioImage(id, setRotateEdit, { allowPanorama: true });
            }}
            onOpenNodeHistory={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setNodeHistoryId(id);
            }}
            onOpenPanorama={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setPanoramaNodeId(id);
            }}
          />
        </div>
      ) : null}

      {showGenPanel && selectedNodes[0] ? (
        <NodeGenPanel
          node={selectedNodes[0]}
          viewport={viewport}
        />
      ) : null}

      <div
        ref={containerRef}
        className="joy-canvas-surface absolute inset-0 touch-none"
        data-grid={gridMode}
        style={{
          cursor:
            isPanningTool || isPanning
              ? isPanning
                ? "grabbing"
                : "grab"
              : marquee
                ? "crosshair"
                : "default",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDownBoard}
        onPointerMove={onPointerMoveBoard}
        onPointerUp={onPointerUpBoard}
        onContextMenu={onBoardContextMenu}
        onDoubleClick={onBoardDoubleClick}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!e.dataTransfer.files?.length) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          void ingestFiles(e.dataTransfer.files, {
            x: (mx - viewport.x) / viewport.zoom,
            y: (my - viewport.y) / viewport.zoom,
          });
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          }}
        >
          <GroupBoundsOverlay
            nodes={nodes}
            selectedIds={selectedIds}
            dropTargetGid={dropTargetGid}
            onGroupTitlePointerDown={(gid, e) => {
              if (isPanningTool) return;
              closeMenus();
              const ids = memberIdsOfGroup(
                useCanvasStore.getState().nodes,
                gid,
              );
              if (ids.length < 2) return;
              setSelection(ids);
              const origins: Record<string, { x: number; y: number }> = {};
              for (const id of ids) {
                const n = useCanvasStore
                  .getState()
                  .nodes.find((x) => x.id === id);
                if (n) origins[id] = { x: n.x, y: n.y };
              }
              drag.current = {
                ids,
                ox: e.clientX,
                oy: e.clientY,
                origins,
                clickToNodeId: null,
              };
              setIsNodeDragging(true);
              containerRef.current?.setPointerCapture(e.pointerId);
            }}
          />
          {selectedNodes.length >= 2 &&
          !isPanningTool &&
          !isNodeDragging &&
          !connectDraft ? (
            <SelectionConnectHandle
              nodes={selectedNodes}
              pad={
                isCompleteGroupSelection(nodes, selectedIds)
                  ? GROUP_PAD
                  : SELECTION_PAD
              }
              onConnectStart={onSelectionConnectStart}
            />
          ) : null}
          <CanvasEdges
            nodes={nodes}
            edges={edges}
            selectedEdgeId={selectedEdgeId}
            selectedNodeIds={selectedIds}
            edgeVisibility={edgeVisibility}
            draft={connectDraft}
            onSelectEdge={(id) => {
              selectEdge(id);
            }}
            onCutEdge={(id) => {
              pushHistory();
              removeEdge(id);
            }}
          />
          {(() => {
            const soleGroupSelected = isCompleteGroupSelection(
              nodes,
              selectedIds,
            );
            const focusSwatch = focusedColorTag
              ? colorTagMeta(focusedColorTag).swatch
              : null;
            return nodes.map((node, index) => {
              if (isHiddenBatchChild(node, nodes)) return null;
              const inSelection = selectedIds.includes(node.id);
              const selected = inSelection && !soleGroupSelected;
              const hovered = hoveredNodeId === node.id;
              const box = nodeBox(node);
              const colorFocused =
                Boolean(focusedColorTag) &&
                colorTagOf(node) === focusedColorTag;
              return (
                <div
                  key={node.id}
                  className="joy-canvas-node"
                  draggable={false}
                  style={{
                    position: "relative",
                    zIndex: inSelection || colorFocused ? 10_000 + index : index + 2,
                    isolation: "isolate",
                  }}
                  onDragStart={(event) => event.preventDefault()}
                  onMouseEnter={() => onNodeHoverEnter(node.id)}
                  onMouseLeave={onNodeHoverLeave}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => onNodeContextMenu(e, node)}
                >
                  {colorFocused && focusSwatch ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute rounded-[10px]"
                      style={{
                        left: box.x - 3,
                        top: box.y - 3,
                        width: box.width + 6,
                        height: box.height + 6,
                        boxShadow: `0 0 0 2px ${focusSwatch}, 0 0 0 5px color-mix(in oklab, ${focusSwatch} 28%, transparent)`,
                      }}
                    />
                  ) : null}
                  <NodeView
                    node={node}
                    onPointerDown={onNodePointerDown}
                    editingImage={editingImageId === node.id}
                    onEditingImageChange={(open) =>
                      setEditingImageId(open ? node.id : null)
                    }
                    onOpenDirector={(id) => setDirectorId(id)}
                  />
                  <NodeHandles
                    node={node}
                    visible={
                      selected ||
                      hovered ||
                      connectDraft?.sourceId === node.id ||
                      Boolean(connectDraft?.sourceIds?.includes(node.id))
                    }
                    onConnectStart={onConnectStart}
                  />
                </div>
              );
            });
          })()}
          {selectedIds.length === 1 && !isPanningTool
            ? (() => {
                const n = nodes.find((x) => x.id === selectedIds[0]);
                return n ? (
                  <NodeResizeHandles
                    node={n}
                    zoom={viewport.zoom}
                    onResizingChange={setIsNodeResizing}
                  />
                ) : null;
              })()
            : null}
        </div>

        {marqueeStyle ? (
          <div
            className="joy-canvas-marquee pointer-events-none absolute z-[5]"
            style={marqueeStyle}
          />
        ) : null}

        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center px-4 pb-28 text-center">
            <p className="joy-canvas-empty-hint text-[28px] font-medium tracking-tight">
              双击 / 右键、拖入文件或底栏工具添加节点
            </p>
            <p className="joy-canvas-empty-hint-sub mt-2 text-sm">
              框选多选 · 绿点连线 · 多选右侧绿点批量连 · Space 临时拖移 · ? 快捷键
            </p>
          </div>
        ) : null}
      </div>

      {createMenu ? (
        <CanvasCreateMenu
          menu={createMenu}
          viewportSize={viewportSize}
          onCreate={handleCreateFromMenu}
          onUpload={
            createMenu.kind === "blank"
              ? () => {
                  openUploadAt({
                    x: createMenu.worldX,
                    y: createMenu.worldY,
                  });
                  setCreateMenu(null);
                }
              : undefined
          }
          onOpenAssets={
            createMenu.kind === "blank"
              ? () => {
                  setAssetPickerOpen(true);
                  setCreateMenu(null);
                }
              : undefined
          }
          onClose={() => setCreateMenu(null)}
        />
      ) : null}

      {nodeMenu ? (
        <CanvasNodeContextMenu
          menu={nodeMenu}
          viewportSize={viewportSize}
          onDuplicate={() => {
            pushHistory();
            duplicateNodes(useCanvasStore.getState().selectedIds);
            setNodeMenu(null);
          }}
          onDelete={() => {
            pushHistory();
            removeNodes(useCanvasStore.getState().selectedIds);
            setNodeMenu(null);
          }}
          onGroup={
            nodeMenu.canGroup
              ? () => {
                  pushHistory();
                  groupSelection();
                  setNodeMenu(null);
                }
              : undefined
          }
          onUngroup={
            nodeMenu.canUngroup
              ? () => {
                  pushHistory();
                  ungroupSelection();
                  setNodeMenu(null);
                }
              : undefined
          }
          onSaveAsset={
            canSaveNodeAsset(
              useCanvasStore
                .getState()
                .nodes.find((item) => item.id === nodeMenu.nodeId),
            )
              ? () => {
                  const id = nodeMenu.nodeId;
                  setNodeMenu(null);
                  void saveNodeAsset(id);
                }
              : undefined
          }
          onDownload={
            nodeMenu.hasMedia
              ? () => {
                  const node = useCanvasStore
                    .getState()
                    .nodes.find((item) => item.id === nodeMenu.nodeId);
                  setNodeMenu(null);
                  if (node) void downloadNodeMedia(node);
                }
              : undefined
          }
          onInfo={() => {
            const id = nodeMenu.nodeId;
            setNodeMenu(null);
            openInfo(id);
          }}
          onClose={() => setNodeMenu(null)}
        />
      ) : null}

      <ImageToolDialog
        mode={imageTool?.mode ?? null}
        url={imageTool?.url ?? ""}
        nodeTitle={studioNodeTitle(imageTool?.nodeId)}
        onClose={() => setImageTool(null)}
        onCommit={commitImageTool}
      />

      <ImageAngleDialog
        open={Boolean(angleNodeId)}
        url={String(
          nodes.find((item) => item.id === angleNodeId)?.data.url ?? "",
        )}
        nodeTitle={studioNodeTitle(angleNodeId)}
        onClose={() => setAngleNodeId(null)}
        onConfirm={({ params, modelId }) => {
          const id = angleNodeId;
          setAngleNodeId(null);
          if (id) spawnAnglePrompt(id, params, modelId);
        }}
      />

      <ImagePanoramaDialog
        open={Boolean(panoramaNodeId)}
        url={String(
          nodes.find((item) => item.id === panoramaNodeId)?.data.url ?? "",
        )}
        nodeTitle={studioNodeTitle(panoramaNodeId)}
        onClose={() => setPanoramaNodeId(null)}
        onConfirm={({ note, modelId }) => {
          const id = panoramaNodeId;
          setPanoramaNodeId(null);
          if (id) void spawnPanoramaPrompt(id, { note, modelId });
        }}
      />

      <ImageReversePromptDialog
        open={Boolean(reversePromptNodeId)}
        url={String(
          nodes.find((item) => item.id === reversePromptNodeId)?.data.url ??
            "",
        )}
        nodeTitle={studioNodeTitle(reversePromptNodeId)}
        onClose={() => setReversePromptNodeId(null)}
        onConfirm={({ modelId }) => {
          const id = reversePromptNodeId;
          setReversePromptNodeId(null);
          if (id) void spawnReversePrompt(id, modelId);
        }}
      />

      <ImageFxDialog
        open={Boolean(imageFx)}
        mode={imageFx?.mode ?? null}
        url={String(
          nodes.find((item) => item.id === imageFx?.nodeId)?.data.url ?? "",
        )}
        nodeTitle={studioNodeTitle(imageFx?.nodeId)}
        onClose={() => setImageFx(null)}
        onConfirm={({ mode, note, stylePrompt, modelId }) => {
          const id = imageFx?.nodeId;
          setImageFx(null);
          if (id) {
            spawnImageFx(id, { mode, note, stylePrompt, modelId });
          }
        }}
      />

      <ImageRotateDialog
        open={Boolean(rotateEdit)}
        url={rotateEdit?.url ?? ""}
        nodeTitle={studioNodeTitle(rotateEdit?.nodeId)}
        onClose={() => setRotateEdit(null)}
        onConfirm={async (payload) => {
          const id = rotateEdit?.nodeId;
          if (!id) {
            setRotateEdit(null);
            return;
          }
          await spawnRotatedImage(id, payload);
          setRotateEdit(null);
        }}
      />

      <NodeGenHistoryDialog
        node={nodes.find((item) => item.id === nodeHistoryId) ?? null}
        projectId={projectId}
        open={Boolean(nodeHistoryId)}
        onClose={() => setNodeHistoryId(null)}
      />

      <NodeInfoDialog
        node={nodes.find((item) => item.id === infoNodeId) ?? null}
        open={Boolean(infoNodeId)}
        onClose={() => setInfoNodeId(null)}
      />
      <AudioTrimDialog
        url={audioTrim?.url ?? ""}
        mode={
          nodes.find((item) => item.id === audioTrim?.nodeId)?.type === "video"
            ? "video"
            : "audio"
        }
        open={Boolean(audioTrim)}
        busy={audioTrimBusy}
        onClose={() => {
          if (!audioTrimBusy) setAudioTrim(null);
        }}
        onConfirm={(range) => void commitAudioTrim(range)}
      />
      <VideoFramePickDialog
        url={framePick?.url ?? ""}
        open={Boolean(framePick)}
        busy={framePickBusy}
        initialTime={framePick?.initialTime ?? 0}
        onClose={() => {
          if (!framePickBusy) setFramePick(null);
        }}
        onConfirm={(time) => void commitFramePick(time)}
      />
      <MaskEditDialog
        url={maskEdit?.url ?? ""}
        open={Boolean(maskEdit)}
        nodeTitle={studioNodeTitle(maskEdit?.nodeId)}
        onClose={() => setMaskEdit(null)}
        onConfirm={commitMask}
      />
      <ImageRedrawDialog
        url={redrawEdit?.url ?? ""}
        open={Boolean(redrawEdit)}
        sourceNodeId={redrawEdit?.nodeId}
        nodeTitle={studioNodeTitle(redrawEdit?.nodeId)}
        onClose={() => setRedrawEdit(null)}
        onConfirm={commitRedraw}
      />
      <ImageOutpaintDialog
        open={Boolean(outpaintEdit)}
        url={outpaintEdit?.url ?? ""}
        nodeTitle={studioNodeTitle(outpaintEdit?.nodeId)}
        onClose={() => setOutpaintEdit(null)}
        onConfirm={async (payload) => {
          const id = outpaintEdit?.nodeId;
          if (!id) return;
          await spawnMarkedImageEdit({
            sourceNodeId: id,
            blob: payload.blob,
            prompt: payload.prompt,
            operation: "outpaint",
            projectId,
            modelId: payload.modelId,
            resolution: payload.resolution,
            ratio: payload.ratio,
            markedTitle: "扩图参考",
            toastLabel: "正在提交扩图…",
          });
          setOutpaintEdit(null);
        }}
      />
      <ImageScribbleDialog
        open={Boolean(scribbleEdit)}
        url={scribbleEdit?.url ?? ""}
        nodeTitle={studioNodeTitle(scribbleEdit?.nodeId)}
        onClose={() => setScribbleEdit(null)}
        onConfirm={async (payload) => {
          const id = scribbleEdit?.nodeId;
          if (!id) return;
          await spawnMarkedImageEdit({
            sourceNodeId: id,
            blob: payload.blob,
            prompt: payload.prompt,
            operation: "generate",
            projectId,
            markedTitle: "涂鸦参考",
            toastLabel: "正在提交涂鸦改图…",
          });
          setScribbleEdit(null);
        }}
      />
      <ImageLightingDialog
        open={Boolean(lightingEdit)}
        url={lightingEdit?.url ?? ""}
        nodeTitle={studioNodeTitle(lightingEdit?.nodeId)}
        onClose={() => setLightingEdit(null)}
        onConfirm={({ prompt, modelId }) => {
          const id = lightingEdit?.nodeId;
          setLightingEdit(null);
          if (id) spawnLightingPrompt(id, prompt, modelId);
        }}
      />

      <input
        ref={uploadRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const at = uploadAtRef.current;
          if (file) void ingestFiles([file], at ?? undefined);
          uploadAtRef.current = null;
          e.target.value = "";
        }}
      />
      {directorId ? (
        <DirectorDesk
          nodeId={directorId}
          onClose={() => setDirectorId(null)}
        />
      ) : null}
      </div>
    </div>
  );
}
