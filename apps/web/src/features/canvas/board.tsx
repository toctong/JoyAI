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
import { GroupBoundsOverlay } from "./group-bounds-overlay";
import { NodeView } from "./node-view";
import { NodeResizeHandles } from "./node-resize-handles";
import { NodeGenPanel } from "./node-gen-panel";
import { CanvasEdges, NodeHandles } from "./canvas-edges";
import { hitNodeAt, nodeBox } from "./lib/node-box";
import {
  CanvasCreateMenu,
  CanvasNodeContextMenu,
  type CanvasCreateMenuState,
  type CanvasNodeMenuState,
} from "./canvas-context-menu";
import { CanvasRightPanel } from "./canvas-right-panel";
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
  selectionBounds,
} from "./lib/align";
import { copiedGroupId, prepareCopiedData } from "./lib/copy-node";
import {
  isCanvasOverlayTarget,
  readGridModePreference,
  writeGridModePreference,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import {
  captureVideoFrame,
  type VideoFrameAt,
} from "./lib/capture-video-frame";
import { api, apiUpload } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { titleFromPrompt, fileNameFromUrl } from "./lib/node-title";
import { toast } from "@/shared/lib/toast";
import { DirectorDesk } from "./director-desk";
import { ImageToolDialog, type ImageToolMode } from "./image-tool-dialog";
import { ImageAngleDialog } from "./image-angle-dialog";
import { NodeInfoDialog } from "./node-info-dialog";
import { AudioTrimDialog } from "./audio-trim-dialog";
import { MaskEditDialog } from "./mask-edit-dialog";
import { trimMediaToFile } from "./lib/trim-audio";
import { flagPanoramaAspect } from "./lib/panorama-prompt";
import { convertImagePanoramaType } from "./lib/convert-media-type";
import { commitImagePieces } from "./lib/commit-image-pieces";
import {
  copyUpstreamPrompt,
  toggleFreeResize,
} from "./lib/image-node-actions";
import { canSaveNodeAsset, saveNodeAsset } from "./lib/save-node-asset";
import { spawnReversePrompt } from "./lib/reverse-prompt";
import { spawnAnglePrompt } from "./lib/spawn-angle-prompt";
import type { RasterPiece } from "./lib/image-raster";
import {
  nodeTypeForAssetKind,
  nodeTypeForUpload,
  probeImageUrlType,
} from "./lib/upload-node-type";
import { extractAudioFromVideo } from "./lib/extract-audio";
import { frameNodeToMedia } from "./lib/fit-node-size";
import { getPlaybackTime } from "./lib/playback-clock";
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
};

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

function isEmptyMediaNode(node: CanvasNode) {
  const url = String(node.data.url ?? "");
  return !url || url.startsWith("data:");
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
  const [genPanelOpen, setGenPanelOpen] = useState(true);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [gridMode, setGridMode] = useState<CanvasGridMode>("dots");
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
  const [infoNodeId, setInfoNodeId] = useState<string | null>(null);
  const [audioTrim, setAudioTrim] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [audioTrimBusy, setAudioTrimBusy] = useState(false);
  const [maskEdit, setMaskEdit] = useState<{
    nodeId: string;
    url: string;
  } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [projectReady, setProjectReady] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [toolbarPinned, setToolbarPinned] = useState(false);
  const [connectDraft, setConnectDraft] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);
  const focusApplied = useRef(false);
  const connectSourceRef = useRef<string | null>(null);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const drag = useRef<{
    ids: string[];
    ox: number;
    oy: number;
    origins: Record<string, { x: number; y: number }>;
  } | null>(null);
  const dragPushed = useRef(false);
  const marqueeRef = useRef<Marquee | null>(null);
  const marqueeAdditive = useRef(false);
  const clipboard = useRef<ClipboardPayload>({ nodes: [], edges: [] });

  const viewport = useCanvasStore((s) => s.viewport);
  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
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
  const expandSelectionWithGroup = useCanvasStore(
    (s) => s.expandSelectionWithGroup,
  );
  const focusNode = useCanvasStore((s) => s.focusNode);
  const focusByJobOrAsset = useCanvasStore((s) => s.focusByJobOrAsset);

  /** Space temporarily flips select ↔ pan (cleared on keyup / blur). */
  const isPanningTool = panMode ? !spaceDown : spaceDown;
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
  const hoveredNode = hoveredNodeId
    ? nodes.find((n) => n.id === hoveredNodeId)
    : null;
  const floatToolbarNodes =
    selectedNodes.length > 1
      ? []
      : hoveredNode
        ? [hoveredNode]
        : selectedNodes.length === 1
          ? selectedNodes
          : [];

  const mentionHighlights = useMemo(
    () => computeMentionHighlightIds(nodes, selectedIds, edges),
    [edges, nodes, selectedIds],
  );

  useEffect(() => {
    setHighlightedIds(mentionHighlights);
  }, [mentionHighlights, setHighlightedIds]);

  useEffect(() => {
    setMiniMapOpen(readMinimapOpenPreference(true));
    setSnapToGrid(readSnapPreference(true));
    setGridMode(readGridModePreference("dots"));
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
    if (!nodeId && !jobId && !assetId) return;
    let ok = false;
    if (nodeId) ok = focusNode(nodeId, viewportSize);
    if (!ok) ok = focusByJobOrAsset({ jobId, assetId }, viewportSize);
    if (ok) focusApplied.current = true;
  }, [
    projectReady,
    viewportSize,
    focusQuery?.nodeId,
    focusQuery?.jobId,
    focusQuery?.assetId,
    focusNode,
    focusByJobOrAsset,
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

  useEffect(() => {
    const socket = getJobsSocket();
    const onCompleted = (payload: {
      jobId: string;
      assets?: { id: string; url: string }[];
    }) => {
      const asset = payload.assets?.[0];
      if (!asset) return;
      const matches = useCanvasStore
        .getState()
        .nodes.filter((node) => node.data.jobId === payload.jobId);
      if (!matches.length) return;
      const keepSelection = useCanvasStore.getState().selectedIds.slice();
      useCanvasStore.getState().pushHistory();
      let addedNode = false;
      for (const node of matches) {
        const live = useCanvasStore.getState();
        if (node.type === "prompt") {
          const url = String(asset.url ?? "").toLowerCase();
          const stored = String(node.data.outputKind ?? "");
          const outputKind: "image" | "video" | "panorama" =
            stored === "video" || /\.(mp4|webm|mov)(\?|$)/.test(url)
              ? "video"
              : stored === "panorama"
                ? "panorama"
                : "image";
          updateNodeData(node.id, {
            status: "succeeded",
            error: "",
          });
          const outgoing = live.edges
            .filter((e) => e.source === node.id)
            .map((e) => live.nodes.find((n) => n.id === e.target))
            .filter((n): n is CanvasNode => n != null && n.type === outputKind);
          const emptyTarget = outgoing.find(isEmptyMediaNode);
          const named = titleFromPrompt(String(node.data.prompt ?? ""));
          const fileName = fileNameFromUrl(asset.url);
          if (emptyTarget) {
            updateNodeData(emptyTarget.id, {
              url: asset.url,
              assetId: asset.id,
              status: "succeeded",
              error: "",
              prompt: String(node.data.prompt ?? ""),
              ...(fileName ? { fileName } : {}),
              ...(named && !String(emptyTarget.data.title ?? "").trim()
                ? { title: named }
                : {}),
              ...(outputKind === "panorama"
                ? { projection: "equirectangular" }
                : {}),
            });
            if (outputKind === "panorama") {
              notePanoramaAspect(emptyTarget.id, asset.url);
            } else if (outputKind === "image" || outputKind === "video") {
              void frameNodeToMedia(emptyTarget.id, asset.url, outputKind);
            }
          } else {
            const box = nodeBox(node);
            const mediaId = live.addNode(outputKind, {
              x: box.x + box.width + 40,
              y: box.y,
            });
            updateNodeData(mediaId, {
              url: asset.url,
              assetId: asset.id,
              status: "succeeded",
              prompt: String(node.data.prompt ?? ""),
              ...(fileName ? { fileName } : {}),
              ...(named ? { title: named } : {}),
              ...(outputKind === "panorama"
                ? { projection: "equirectangular" }
                : {}),
            });
            live.addEdge(node.id, mediaId);
            if (outputKind === "panorama") notePanoramaAspect(mediaId, asset.url);
            else if (outputKind === "image" || outputKind === "video") {
              void frameNodeToMedia(mediaId, asset.url, outputKind);
            }
            addedNode = true;
          }
        } else {
          const selfNamed = titleFromPrompt(String(node.data.prompt ?? ""));
          updateNodeData(node.id, {
            url: asset.url,
            assetId: asset.id,
            status: "succeeded",
            error: "",
            ...(selfNamed && !String(node.data.title ?? "").trim()
              ? { title: selfNamed }
              : {}),
            ...(fileNameFromUrl(asset.url)
              ? { fileName: fileNameFromUrl(asset.url) }
              : {}),
            ...(node.type === "panorama"
              ? { projection: "equirectangular" }
              : {}),
          });
          if (node.type === "panorama") notePanoramaAspect(node.id, asset.url);
          else if (node.type === "image" || node.type === "video") {
            void frameNodeToMedia(node.id, asset.url, node.type);
          }
        }
      }
      if (addedNode) {
        useCanvasStore.getState().setSelection(keepSelection);
      }
    };
    const onFailed = (payload: { jobId: string; error?: string }) => {
      const state = useCanvasStore.getState();
      for (const node of state.nodes) {
        if (node.data.jobId !== payload.jobId) continue;
        updateNodeData(node.id, {
          status: "failed",
          error: payload.error ?? "生成失败",
        });
      }
    };
    socket.on("job:completed", onCompleted);
    socket.on("job:failed", onFailed);
    const onAssetUpdated = (payload: {
      asset?: { id: string; url: string };
      jobId?: string | null;
    }) => {
      const asset = payload.asset;
      if (!asset?.id || !asset.url) return;
      const state = useCanvasStore.getState();
      for (const node of state.nodes) {
        if (!mediaKindOf(node)) continue;
        const byAsset = node.data.assetId === asset.id;
        const byJob = payload.jobId && node.data.jobId === payload.jobId;
        if (!byAsset && !byJob) continue;
        updateNodeData(node.id, {
          url: asset.url,
          assetId: asset.id,
        });
      }
    };
    socket.on("asset:updated", onAssetUpdated);
    return () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
      socket.off("asset:updated", onAssetUpdated);
    };
  }, [updateNodeData]);

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
      let i = 0;
      const vp = useCanvasStore.getState().viewport;
      for (const file of list) {
        const asset = await apiUpload<{
          id: string;
          url: string;
          kind: string;
        }>("/upload", file);
        const type = await nodeTypeForUpload(file, asset.kind);
        const id = addNode(type, {
          x: (at?.x ?? (-vp.x + 280) / vp.zoom) + i * 36,
          y: (at?.y ?? (-vp.y + 160) / vp.zoom) + i * 36,
        });
        updateNodeData(id, {
          url: asset.url,
          assetId: asset.id,
          status: "succeeded",
          ...(type === "panorama" ? { projection: "equirectangular" } : {}),
        });
        if (type === "panorama") notePanoramaAspect(id, asset.url);
        else if (type === "image" || type === "video") {
          void frameNodeToMedia(id, file, type);
        }
        i += 1;
      }
    },
    [addNode, pushHistory, updateNodeData],
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
        const ids = expandSelectionWithGroup(state.selectedIds);
        if (!ids.length) return;
        e.preventDefault();
        if (ids.length !== state.selectedIds.length) setSelection(ids);
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
        connectSourceRef.current = null;
        useCanvasRightPanelStore.getState().close();
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
    expandSelectionWithGroup,
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
    const hit = useCanvasStore
      .getState()
      .nodes.filter((n) => {
        const box = nodeBox(n);
        return rectsIntersect(world, {
          x: box.x,
          y: box.y,
          w: box.width,
          h: box.height,
        });
      })
      .map((n) => n.id);
    const expanded = expandSelectionWithGroup(hit);
    if (marqueeAdditive.current) {
      const merged = new Set([
        ...useCanvasStore.getState().selectedIds,
        ...expanded,
      ]);
      setSelection([...merged]);
    } else {
      setSelection(expanded);
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
    if (connectSourceRef.current) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const vp = useCanvasStore.getState().viewport;
        const wx = (e.clientX - rect.left - vp.x) / vp.zoom;
        const wy = (e.clientY - rect.top - vp.y) / vp.zoom;
        setConnectDraft({
          sourceId: connectSourceRef.current,
          x: wx,
          y: wy,
        });
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
        useCanvasStore.getState().raiseNodes(drag.current.ids);
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
    if (connectSourceRef.current) {
      const sourceId = connectSourceRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const vp = useCanvasStore.getState().viewport;
        const liveNodes = useCanvasStore.getState().nodes;
        const wx = (localX - vp.x) / vp.zoom;
        const wy = (localY - vp.y) / vp.zoom;
        const hit = hitNodeAt(liveNodes, wx, wy);
        if (hit && hit.id !== sourceId) {
          pushHistory();
          addEdge(sourceId, hit.id);
        } else if (!hit) {
          const sourceNode = liveNodes.find((n) => n.id === sourceId);
          setCreateMenu({
            kind: "connect",
            x: localX,
            y: localY,
            worldX: wx,
            worldY: wy,
            sourceId,
            preferredType:
              sourceNode?.type === "panorama"
                ? "director"
                : sourceNode?.type === "image" ||
                    sourceNode?.type === "text" ||
                    sourceNode?.type === "video" ||
                    sourceNode?.type === "audio"
                  ? "prompt"
                  : undefined,
          });
        }
      }
      connectSourceRef.current = null;
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

    let dragIds: string[];
    // Alt: drag this node alone (leave group on drop) — not a duplicate.
    if (e.altKey) {
      setSelection([node.id]);
      dragIds = [node.id];
    } else if (additive) {
      select(node.id, { additive: true });
      const ids = useCanvasStore.getState().selectedIds;
      if (!ids.includes(node.id)) return;
      dragIds = expandSelectionWithGroup(ids);
      if (dragIds.length !== ids.length) setSelection(dragIds);
    } else if (already) {
      dragIds = expandSelectionWithGroup(state.selectedIds);
      if (dragIds.length !== state.selectedIds.length) {
        setSelection(dragIds);
      }
    } else {
      dragIds = expandSelectionWithGroup([node.id]);
      setSelection(dragIds);
    }

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
    };
    setIsNodeDragging(true);
    containerRef.current?.setPointerCapture(e.pointerId);
  }

  function onConnectStart(nodeId: string, e: React.PointerEvent) {
    connectSourceRef.current = nodeId;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
    const wy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
    setConnectDraft({ sourceId: nodeId, x: wx, y: wy });
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
      setSelection(expandSelectionWithGroup([node.id]));
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
    if (menu.kind === "connect" && menu.sourceId) {
      addEdge(menu.sourceId, id);
      const source = nodes.find((n) => n.id === menu.sourceId);
      if (
        type === "prompt" &&
        source &&
        (source.type === "image" ||
          source.type === "video" ||
          source.type === "panorama" ||
          source.type === "audio")
      ) {
        const assetId = String(source.data.assetId ?? "");
        const refUrl = String(source.data.url ?? "");
        updateNodeData(id, {
          outputKind:
            source.type === "audio"
              ? "video"
              : source.type === "panorama"
                ? "panorama"
                : "image",
          referenceIds: assetId ? [assetId, source.id] : [source.id],
          referenceUrls:
            refUrl && !refUrl.startsWith("data:") ? [refUrl] : [],
        });
      }
      if (type === "prompt" && source?.type === "text") {
        updateNodeData(id, {
          prompt: String(source.data.text ?? "").trim(),
        });
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
    if (toolbarPinned) return;
    clearHoverLeaveTimer();
    hoverLeaveTimer.current = setTimeout(() => {
      setHoveredNodeId(null);
    }, 220);
  }

  async function insertAssetAtCenter(
    asset: { id: string; url: string; kind: string },
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
    updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
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
    assets: { id: string; url: string; kind: string }[],
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

  async function handleCaptureVideoFrame(at: VideoFrameAt) {
    const id = nodeMenu?.nodeId;
    setNodeMenu(null);
    if (!id) return;
    const node = useCanvasStore.getState().nodes.find((n) => n.id === id);
    if (!node || node.type !== "video") return;
    const url = String(node.data.url ?? "");
    if (!url || url.startsWith("data:")) return;
    try {
      pushHistory();
      const file = await captureVideoFrame(
        url,
        at,
        at === "current" ? getPlaybackTime(id) : 0,
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
        title:
          at === "first" ? "首帧" : at === "last" ? "尾帧" : "当前帧",
      });
      addEdge(node.id, imageId);
      toast.success("已截取帧并创建图像节点");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截帧失败");
    }
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
      pushHistory();
      toast.message("正在抽音，请稍候…");
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "抽音失败");
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
    setAudioTrimBusy(true);
    try {
      const file = await trimMediaToFile(session.url, range.start, range.end);
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      pushHistory();
      const audioId = addNode("audio", {
        x: node.x + (node.width ?? 280) + 40,
        y: node.y + 28,
      });
      updateNodeData(audioId, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        title: "截取音频",
      });
      addEdge(node.id, audioId);
      setSelection([audioId]);
      setAudioTrim(null);
      toast.success("已截取并创建音频节点");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "截取失败");
    } finally {
      setAudioTrimBusy(false);
    }
  }

  async function commitMask(payload: { prompt: string; blob: Blob }) {
    const session = maskEdit;
    if (!session) return;
    const node = useCanvasStore
      .getState()
      .nodes.find((item) => item.id === session.nodeId);
    if (!node) {
      toast.error("节点已不存在");
      setMaskEdit(null);
      return;
    }
    const toastId = toast.loading("正在提交局部重绘…");
    try {
      const file = new File([payload.blob], `mask-${Date.now()}.png`, {
        type: "image/png",
      });
      const asset = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      pushHistory();
      const box = nodeBox(node);
      const markedId = addNode("image", {
        x: box.x + box.width + 40,
        y: box.y,
      });
      updateNodeData(markedId, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
        title: "涂抹参考",
      });
      const promptId = addNode("prompt", {
        x: box.x + box.width + 40,
        y: box.y + box.height + 36,
      });
      const sourceAssetId = String(node.data.assetId ?? "");
      const sourceUrl = String(node.data.url ?? "");
      const referenceAssetIds = [
        ...new Set(
          [sourceAssetId, asset.id].filter(Boolean),
        ),
      ];
      const referenceUrls = [
        ...new Set(
          [sourceUrl, asset.url].filter(
            (item) => item && !item.startsWith("data:"),
          ),
        ),
      ];
      updateNodeData(promptId, {
        prompt: payload.prompt,
        operation: "inpaint",
        outputKind: "image",
        status: "queued",
        error: "",
        referenceIds: referenceAssetIds,
        referenceUrls,
      });
      addEdge(node.id, promptId);
      addEdge(markedId, promptId);
      setSelection([promptId]);
      setMaskEdit(null);

      const job = await api<{ id: string }>("/jobs", {
        method: "POST",
        body: {
          kind: "image",
          input: {
            prompt: payload.prompt,
            n: 1,
            canvasProjectId: projectId,
            canvasNodeId: promptId,
            referenceAssetIds,
            referenceUrls,
            operation: "inpaint",
          },
        },
      });
      updateNodeData(promptId, { status: "running", jobId: job.id });
      toast.success("已提交局部重绘", { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "局部重绘失败", {
        id: toastId,
      });
    }
  }

  function handleConvertType(to: "image" | "panorama") {
    const id = nodeMenu?.nodeId;
    setNodeMenu(null);
    if (!id) return;
    pushHistory();
    convertImagePanoramaType(id, to);
  }

  const chromeBusy = isPanningTool || isNodeDragging || isNodeResizing;
  const selectedMedia =
    selectedNodes.length === 1 ? mediaKindOf(selectedNodes[0]) : null;
  const genCapable =
    selectedMedia === "image" ||
    selectedMedia === "video" ||
    selectedMedia === "panorama";
  const emptyMedia =
    genCapable &&
    (!String(selectedNodes[0]?.data.url ?? "") ||
      String(selectedNodes[0]?.data.url ?? "").startsWith("data:"));
  const showGenPanel = genCapable && !chromeBusy && (genPanelOpen || emptyMedia);

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
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      <CanvasTopBar
        projectId={projectId}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={undo}
        onRedo={redo}
        onImport={() => uploadRef.current?.click()}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
      <CanvasRightPanel
        projectId={projectId}
        nodes={nodes}
        selectedIds={selectedIds}
        onFocusNode={(id) => {
          focusNode(id, viewportSize);
        }}
        onFocusJob={({ jobId, assetId, nodeId }) => {
          let ok = false;
          if (nodeId) ok = focusNode(nodeId, viewportSize);
          if (!ok) ok = focusByJobOrAsset({ jobId, assetId }, viewportSize);
        }}
      />
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
        onZoomChange={(z) => zoomAt(Math.min(5, Math.max(0.05, z)))}
        onFit={fitToContent}
        onToggleMiniMap={toggleMiniMap}
        onToggleShortcuts={() => setShortcutsOpen((v) => !v)}
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
        <MultiSelectToolbar nodes={selectedNodes} viewport={viewport} />
      ) : null}

      {floatToolbarNodes.length === 1 && !chromeBusy ? (
        <div
          onMouseEnter={clearHoverLeaveTimer}
          onMouseLeave={onNodeHoverLeave}
        >
          <NodeFloatToolbar
            nodes={floatToolbarNodes}
            viewport={viewport}
            onEditImage={(id) => setEditingImageId(id)}
            onOpenDirector={(id) => setDirectorId(id)}
            genPanelOpen={genPanelOpen}
            onToggleGenPanel={
              genCapable ? () => setGenPanelOpen((v) => !v) : undefined
            }
            onOpenImageTool={(mode) => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openImageTool(id, mode);
            }}
            onOpenAngle={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) setAngleNodeId(id);
            }}
            onOpenInfo={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openInfo(id);
            }}
            onOpenAudioTrim={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openAudioTrim(id);
            }}
            onOpenMask={() => {
              const id = floatToolbarNodes[0]?.id;
              if (id) openMask(id);
            }}
            onPinToolbar={setToolbarPinned}
          />
        </div>
      ) : null}

      {showGenPanel && selectedNodes[0] ? (
        <NodeGenPanel
          node={selectedNodes[0]}
          viewport={viewport}
          onClose={() => setGenPanelOpen(false)}
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
          <CanvasEdges
            nodes={nodes}
            edges={edges}
            selectedEdgeId={selectedEdgeId}
            draft={connectDraft}
            onSelectEdge={(id) => {
              selectEdge(id);
            }}
            onCutEdge={(id) => {
              pushHistory();
              removeEdge(id);
            }}
          />
          {nodes.map((node, index) => {
            const selected = selectedIds.includes(node.id);
            return (
              <div
                key={node.id}
                className="joy-canvas-node"
                draggable={false}
                style={{
                  position: "relative",
                  zIndex: selected ? 10_000 + index : index + 1,
                  isolation: "isolate",
                }}
                onDragStart={(event) => event.preventDefault()}
                onMouseEnter={() => onNodeHoverEnter(node.id)}
                onMouseLeave={onNodeHoverLeave}
                onContextMenu={(e) => onNodeContextMenu(e, node)}
              >
                <NodeView
                  node={node}
                  onPointerDown={onNodePointerDown}
                  editingImage={editingImageId === node.id}
                  onEditingImageChange={(open) =>
                    setEditingImageId(open ? node.id : null)
                  }
                  onOpenDirector={(id) => setDirectorId(id)}
                />
                <NodeHandles node={node} onConnectStart={onConnectStart} />
              </div>
            );
          })}
          <GroupBoundsOverlay
            nodes={nodes}
            selectedIds={selectedIds}
            dropTargetGid={dropTargetGid}
          />
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
              框选多选 · 绿点连线 · Space 临时拖移 · ? 快捷键
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
          onCaptureFrame={
            nodeMenu.nodeType === "video" && nodeMenu.hasMedia
              ? (at) => void handleCaptureVideoFrame(at)
              : undefined
          }
          onExtractAudio={
            nodeMenu.nodeType === "video" && nodeMenu.hasMedia
              ? () => void handleExtractAudio()
              : undefined
          }
          onConvertType={
            nodeMenu.hasMedia &&
            (nodeMenu.nodeType === "image" || nodeMenu.nodeType === "panorama")
              ? handleConvertType
              : undefined
          }
          onImageTool={
            nodeMenu.hasMedia &&
            (nodeMenu.nodeType === "image" || nodeMenu.nodeType === "panorama")
              ? (mode) => {
                  const id = nodeMenu.nodeId;
                  setNodeMenu(null);
                  openImageTool(id, mode);
                }
              : undefined
          }
          onCopyPrompt={
            nodeMenu.nodeType === "image" || nodeMenu.nodeType === "panorama"
              ? () => {
                  copyUpstreamPrompt(nodeMenu.nodeId);
                  setNodeMenu(null);
                }
              : undefined
          }
          onReversePrompt={
            nodeMenu.hasMedia &&
            (nodeMenu.nodeType === "image" || nodeMenu.nodeType === "panorama")
              ? () => {
                  const id = nodeMenu.nodeId;
                  setNodeMenu(null);
                  void spawnReversePrompt(id);
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
          onOpenAngle={
            nodeMenu.hasMedia &&
            (nodeMenu.nodeType === "image" || nodeMenu.nodeType === "panorama")
              ? () => {
                  const id = nodeMenu.nodeId;
                  setNodeMenu(null);
                  setAngleNodeId(id);
                }
              : undefined
          }
          onToggleFreeResize={
            nodeMenu.nodeType === "image" ||
            nodeMenu.nodeType === "panorama" ||
            nodeMenu.nodeType === "video"
              ? () => {
                  toggleFreeResize(nodeMenu.nodeId);
                  setNodeMenu(null);
                }
              : undefined
          }
          freeResize={Boolean(
            nodes.find((item) => item.id === nodeMenu.nodeId)?.data.freeResize,
          )}
          onInfo={() => openInfo(nodeMenu.nodeId)}
          onTrimAudio={
            nodeMenu.hasMedia &&
            (nodeMenu.nodeType === "audio" || nodeMenu.nodeType === "video")
              ? () => openAudioTrim(nodeMenu.nodeId)
              : undefined
          }
          onMaskEdit={
            nodeMenu.hasMedia && nodeMenu.nodeType === "image"
              ? () => openMask(nodeMenu.nodeId)
              : undefined
          }
          onClose={() => setNodeMenu(null)}
        />
      ) : null}

      <ImageToolDialog
        mode={imageTool?.mode ?? null}
        url={imageTool?.url ?? ""}
        onClose={() => setImageTool(null)}
        onCommit={commitImageTool}
      />

      <ImageAngleDialog
        open={Boolean(angleNodeId)}
        url={String(
          nodes.find((item) => item.id === angleNodeId)?.data.url ?? "",
        )}
        onClose={() => setAngleNodeId(null)}
        onConfirm={(params) => {
          const id = angleNodeId;
          setAngleNodeId(null);
          if (id) spawnAnglePrompt(id, params);
        }}
      />

      <NodeInfoDialog
        node={nodes.find((item) => item.id === infoNodeId) ?? null}
        open={Boolean(infoNodeId)}
        onClose={() => setInfoNodeId(null)}
      />
      <AudioTrimDialog
        url={audioTrim?.url ?? ""}
        open={Boolean(audioTrim)}
        busy={audioTrimBusy}
        onClose={() => {
          if (!audioTrimBusy) setAudioTrim(null);
        }}
        onConfirm={(range) => void commitAudioTrim(range)}
      />
      <MaskEditDialog
        url={maskEdit?.url ?? ""}
        open={Boolean(maskEdit)}
        onClose={() => setMaskEdit(null)}
        onConfirm={commitMask}
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
