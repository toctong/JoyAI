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
import { CanvasEdges, NodeHandles } from "./canvas-edges";
import {
  CanvasCreateMenu,
  CanvasNodeContextMenu,
  type CanvasCreateMenuState,
  type CanvasNodeMenuState,
} from "./canvas-context-menu";
import { CanvasSidePanel } from "./canvas-side-panel";
import { hydrateSidePanelPrefs } from "./side-panel-store";
import { computeMentionHighlightIds } from "./lib/mention-highlight";
import {
  readSnapPreference,
  snapPoint,
  writeSnapPreference,
} from "./lib/snap";
import { groupIdOf } from "./lib/align";
import {
  isCanvasOverlayTarget,
  readGridModePreference,
  writeGridModePreference,
  type CanvasGridMode,
} from "./lib/canvas-prefs";
import { api, apiUpload } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import "./canvas-chrome.css";

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
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [gridMode, setGridMode] = useState<CanvasGridMode>("dots");
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [createMenu, setCreateMenu] = useState<CanvasCreateMenuState | null>(
    null,
  );
  const [nodeMenu, setNodeMenu] = useState<CanvasNodeMenuState | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [projectReady, setProjectReady] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
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
  const markClean = useCanvasStore((s) => s.markClean);
  const getSnapshot = useCanvasStore((s) => s.getSnapshot);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const undo = useCanvasStore((s) => s.undo);
  const redo = useCanvasStore((s) => s.redo);
  const addNode = useCanvasStore((s) => s.addNode);
  const removeNodes = useCanvasStore((s) => s.removeNodes);
  const duplicateNodes = useCanvasStore((s) => s.duplicateNodes);
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
    selectedNodes.length === 1
      ? selectedNodes
      : selectedNodes.length === 0 && hoveredNode
        ? [hoveredNode]
        : [];

  const mentionHighlights = useMemo(
    () => computeMentionHighlightIds(nodes, selectedIds),
    [nodes, selectedIds],
  );

  useEffect(() => {
    setHighlightedIds(mentionHighlights);
  }, [mentionHighlights, setHighlightedIds]);

  useEffect(() => {
    hydrateSidePanelPrefs();
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
      const state = useCanvasStore.getState();
      for (const node of state.nodes) {
        if (node.data.jobId !== payload.jobId) continue;
        if (node.type === "prompt") {
          updateNodeData(node.id, {
            status: "succeeded",
            url: asset.url,
            assetId: asset.id,
            error: "",
          });
          const outgoing = state.edges
            .filter((e) => e.source === node.id)
            .map((e) => state.nodes.find((n) => n.id === e.target))
            .filter((n): n is CanvasNode => n != null && n.type === "image");
          const emptyTarget = outgoing.find(isEmptyMediaNode);
          if (emptyTarget) {
            updateNodeData(emptyTarget.id, {
              url: asset.url,
              assetId: asset.id,
              status: "succeeded",
              error: "",
            });
          } else {
            const imageId = state.addNode("image", {
              x: node.x + (node.width ?? 280) + 40,
              y: node.y,
            });
            updateNodeData(imageId, {
              url: asset.url,
              assetId: asset.id,
              status: "succeeded",
            });
            state.addEdge(node.id, imageId);
          }
        } else {
          updateNodeData(node.id, {
            url: asset.url,
            assetId: asset.id,
            status: "succeeded",
            error: "",
          });
        }
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
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
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
        const type: CanvasNodeType =
          asset.kind === "video" ? "video" : "image";
        const id = addNode(type, {
          x: (at?.x ?? (-vp.x + 280) / vp.zoom) + i * 36,
          y: (at?.y ?? (-vp.y + 160) / vp.zoom) + i * 36,
        });
        updateNodeData(id, {
          url: asset.url,
          assetId: asset.id,
          status: "succeeded",
        });
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
      const w = src.width ?? 240;
      const h = src.height ?? 180;
      minX = Math.min(minX, src.x);
      minY = Math.min(minY, src.y);
      maxX = Math.max(maxX, src.x + w);
      maxY = Math.max(maxY, src.y + h);
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
    for (const src of srcList) {
      const id = addNode(src.type, { x: src.x + ox, y: src.y + oy });
      idMap.set(src.id, id);
      updateNodeData(id, { ...src.data });
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
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.min(5, Math.max(0.05, viewport.zoom * zoomFactor));
    zoomAt(nextZoom, mx, my);
  }

  function fitToContent() {
    const el = containerRef.current;
    const state = useCanvasStore.getState();
    if (!el) return;
    if (state.nodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of state.nodes) {
      const w = n.width ?? 240;
      const h = n.height ?? 180;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
    const pad = 80;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const zoom = Math.min(
      2.5,
      Math.max(0.05, Math.min(el.clientWidth / bw, el.clientHeight / bh)),
    );
    const x = el.clientWidth / 2 - (minX + (maxX - minX) / 2) * zoom;
    const y = el.clientHeight / 2 - (minY + (maxY - minY) / 2) * zoom;
    setViewport({ x, y, zoom });
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
    const world = {
      x: (left - viewport.x) / viewport.zoom,
      y: (top - viewport.y) / viewport.zoom,
      w: (right - left) / viewport.zoom,
      h: (bottom - top) / viewport.zoom,
    };
    const hit = nodes
      .filter((n) =>
        rectsIntersect(world, {
          x: n.x,
          y: n.y,
          w: n.width ?? 240,
          h: n.height ?? 180,
        }),
      )
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
        vx: viewport.x,
        vy: viewport.y,
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
        const wx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
        const wy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
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
      }
      const dx = (e.clientX - drag.current.ox) / viewport.zoom;
      const dy = (e.clientY - drag.current.oy) / viewport.zoom;
      const state = useCanvasStore.getState();
      const next = state.nodes.map((n) => {
        const origin = drag.current?.origins[n.id];
        if (!origin) return n;
        return { ...n, x: origin.x + dx, y: origin.y + dy };
      });
      useCanvasStore.setState({ nodes: next, dirty: true });
    }
  }

  function onPointerUpBoard(e: React.PointerEvent) {
    if (connectSourceRef.current) {
      const sourceId = connectSourceRef.current;
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        const wx = (localX - viewport.x) / viewport.zoom;
        const wy = (localY - viewport.y) / viewport.zoom;
        const hit = nodes.find((n) => {
          const w = n.width ?? 240;
          const h = n.height ?? (n.type === "text" ? 80 : 180);
          return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h;
        });
        if (hit && hit.id !== sourceId) {
          pushHistory();
          addEdge(sourceId, hit.id);
        } else if (!hit) {
          const sourceNode = nodes.find((n) => n.id === sourceId);
          setCreateMenu({
            kind: "connect",
            x: localX,
            y: localY,
            worldX: wx,
            worldY: wy,
            sourceId,
            preferredType:
              sourceNode?.type === "image" || sourceNode?.type === "text"
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
    panning.current = false;
    setIsPanning(false);
    drag.current = null;
    dragPushed.current = false;
    setIsNodeDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onNodePointerDown(e: React.PointerEvent, node: CanvasNode) {
    if (isPanningTool || e.button === 1) return;
    e.stopPropagation();
    closeMenus();
    const additive = e.shiftKey;
    const state = useCanvasStore.getState();
    const already = state.selectedIds.includes(node.id);

    let dragIds: string[];
    if (additive) {
      select(node.id, { additive: true });
      const ids = useCanvasStore.getState().selectedIds;
      dragIds = ids.includes(node.id) ? ids : [...ids, node.id];
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
      canGroup,
      canUngroup,
    });
  }

  function handleCreateFromMenu(type: CanvasNodeType) {
    if (!createMenu) return;
    pushHistory();
    const id = addNode(type, {
      x: createMenu.worldX,
      y: createMenu.worldY,
    });
    if (createMenu.kind === "connect" && createMenu.sourceId) {
      addEdge(createMenu.sourceId, id);
      const source = nodes.find((n) => n.id === createMenu.sourceId);
      if (type === "prompt" && source?.type === "image") {
        const assetId = String(source.data.assetId ?? "");
        const refUrl = String(source.data.url ?? "");
        updateNodeData(id, {
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
    setCreateMenu(null);
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

  function insertAssetAtCenter(asset: {
    id: string;
    url: string;
    kind: string;
  }) {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    const at = rect
      ? {
          x: (-vp.x + rect.width / 2) / vp.zoom - 120,
          y: (-vp.y + rect.height / 2) / vp.zoom - 90,
        }
      : undefined;
    pushHistory();
    const type: CanvasNodeType = asset.kind === "video" ? "video" : "image";
    const id = addNode(type, at);
    updateNodeData(id, {
      url: asset.url,
      assetId: asset.id,
      status: "succeeded",
    });
    setSelection([id]);
  }

  function addPromptAtCenter(text?: string) {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = useCanvasStore.getState().viewport;
    const at = rect
      ? {
          x: (-vp.x + rect.width / 2) / vp.zoom - 140,
          y: (-vp.y + rect.height / 2) / vp.zoom - 90,
        }
      : undefined;
    pushHistory();
    const id = addNode("prompt", at);
    if (text?.trim()) updateNodeData(id, { prompt: text.trim() });
    setSelection([id]);
  }

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
      <CanvasSidePanel
        nodes={nodes}
        selectedIds={selectedIds}
        onFocusNode={(id) => {
          focusNode(id, viewportSize);
        }}
        onInsertAsset={insertAssetAtCenter}
        onAddPrompt={addPromptAtCenter}
      />
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

      {miniMapOpen ? (
        <CanvasMinimap
          nodes={nodes}
          viewport={viewport}
          viewportSize={viewportSize}
          onViewportChange={setViewport}
        />
      ) : null}

      {selectedNodes.length > 1 && !isPanningTool && !isNodeDragging ? (
        <MultiSelectToolbar nodes={selectedNodes} viewport={viewport} />
      ) : null}

      {floatToolbarNodes.length === 1 && !isPanningTool && !isNodeDragging ? (
        <div
          onMouseEnter={clearHoverLeaveTimer}
          onMouseLeave={onNodeHoverLeave}
        >
          <NodeFloatToolbar
            nodes={floatToolbarNodes}
            viewport={viewport}
            onEditImage={(id) => setEditingImageId(id)}
          />
        </div>
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
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
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
          />
          <GroupBoundsOverlay nodes={nodes} selectedIds={selectedIds} />
          {nodes.map((node) => (
            <div
              key={node.id}
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
              />
              <NodeHandles node={node} onConnectStart={onConnectStart} />
            </div>
          ))}
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
          onClose={() => setNodeMenu(null)}
        />
      ) : null}

      <input
        ref={uploadRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const at = uploadAtRef.current;
          if (file) void ingestFiles([file], at ?? undefined);
          uploadAtRef.current = null;
          e.target.value = "";
        }}
      />
      </div>
    </div>
  );
}
