"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debounce } from "lodash-es";
import type { CanvasNode, CanvasNodeType, CanvasSnapshot } from "@joyai/shared";
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
import { NODE_TYPE_LIST } from "./node-registry";
import { computeMentionHighlightIds } from "./lib/mention-highlight";
import {
  readSnapPreference,
  snapPoint,
  writeSnapPreference,
} from "./lib/snap";
import { api, apiUpload } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";

type ProjectPayload = {
  id: string;
  title: string;
  snapshot: CanvasSnapshot | null;
};

type CtxMenu = {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
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

export function CanvasBoard({
  projectId,
  focusQuery,
}: {
  projectId: string;
  focusQuery?: FocusQuery;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panMode, setPanMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [projectReady, setProjectReady] = useState(false);
  const [connectDraft, setConnectDraft] = useState<{
    sourceId: string;
    x: number;
    y: number;
  } | null>(null);
  const focusApplied = useRef(false);
  const connectSourceRef = useRef<string | null>(null);
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
  const clipboard = useRef<CanvasNode[]>([]);

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
  const expandSelectionWithGroup = useCanvasStore(
    (s) => s.expandSelectionWithGroup,
  );
  const focusNode = useCanvasStore((s) => s.focusNode);
  const focusByJobOrAsset = useCanvasStore((s) => s.focusByJobOrAsset);

  const isPanningTool = spaceDown || panMode;
  const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));

  const mentionHighlights = useMemo(
    () => computeMentionHighlightIds(nodes, selectedIds),
    [nodes, selectedIds],
  );

  useEffect(() => {
    setHighlightedIds(mentionHighlights);
  }, [mentionHighlights, setHighlightedIds]);

  useEffect(() => {
    setMiniMapOpen(readMinimapOpenPreference(true));
    setSnapToGrid(readSnapPreference(true));
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

  const save = useCallback(
    debounce(async () => {
      const snapshot = getSnapshot();
      await api(`/canvas/projects/${projectId}`, {
        method: "PATCH",
        body: { snapshot },
      });
      markClean();
    }, 1000),
    [projectId, getSnapshot, markClean],
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
    return () => {
      socket.off("job:completed", onCompleted);
      socket.off("job:failed", onFailed);
    };
  }, [updateNodeData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !typing) {
        setSpaceDown(true);
        e.preventDefault();
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
      if (mod && e.key.toLowerCase() === "d" && !typing) {
        const ids = useCanvasStore.getState().selectedIds;
        if (ids.length) {
          e.preventDefault();
          pushHistory();
          duplicateNodes(ids);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "a" && !typing) {
        e.preventDefault();
        setSelection(useCanvasStore.getState().nodes.map((n) => n.id));
        return;
      }
      if (mod && e.key.toLowerCase() === "c" && !typing) {
        const state = useCanvasStore.getState();
        const picked = state.nodes.filter((n) =>
          state.selectedIds.includes(n.id),
        );
        if (picked.length) {
          clipboard.current = picked.map((n) => ({
            ...n,
            data: { ...n.data },
          }));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v" && !typing) {
        const srcList = clipboard.current;
        if (!srcList.length) return;
        e.preventDefault();
        pushHistory();
        const created: string[] = [];
        for (const src of srcList) {
          const id = addNode(src.type, { x: src.x + 36, y: src.y + 36 });
          updateNodeData(id, { ...src.data });
          useCanvasStore.getState().updateNode(id, {
            width: src.width,
            height: src.height,
          });
          created.push(id);
        }
        setSelection(created);
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && !typing) {
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
        setCtxMenu(null);
        setEditingImageId(null);
        setMarquee(null);
        marqueeRef.current = null;
        setShortcutsOpen(false);
      }
      if (!typing && (e.key === "?" || (e.shiftKey && e.key === "/"))) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }
      if (!typing && e.key === "0" && !mod) {
        e.preventDefault();
        const el = containerRef.current;
        const state = useCanvasStore.getState();
        if (!el) return;
        if (state.nodes.length === 0) {
          state.setViewport({ x: 0, y: 0, zoom: 1 });
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
          Math.max(0.2, Math.min(el.clientWidth / bw, el.clientHeight / bh)),
        );
        state.setViewport({
          zoom,
          x: el.clientWidth / 2 - (minX + (maxX - minX) / 2) * zoom,
          y: el.clientHeight / 2 - (minY + (maxY - minY) / 2) * zoom,
        });
        return;
      }
      if (mod && !typing && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        const el = containerRef.current;
        const vp = useCanvasStore.getState().viewport;
        const nextZoom = Math.min(3, vp.zoom * 1.1);
        if (!el) {
          useCanvasStore.getState().setViewport({ zoom: nextZoom });
          return;
        }
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const wx = (cx - vp.x) / vp.zoom;
        const wy = (cy - vp.y) / vp.zoom;
        useCanvasStore.getState().setViewport({
          zoom: nextZoom,
          x: cx - wx * nextZoom,
          y: cy - wy * nextZoom,
        });
        return;
      }
      if (mod && !typing && e.key === "-") {
        e.preventDefault();
        const el = containerRef.current;
        const vp = useCanvasStore.getState().viewport;
        const nextZoom = Math.max(0.2, vp.zoom * 0.9);
        if (!el) {
          useCanvasStore.getState().setViewport({ zoom: nextZoom });
          return;
        }
        const cx = el.clientWidth / 2;
        const cy = el.clientHeight / 2;
        const wx = (cx - vp.x) / vp.zoom;
        const wy = (cy - vp.y) / vp.zoom;
        useCanvasStore.getState().setViewport({
          zoom: nextZoom,
          x: cx - wx * nextZoom,
          y: cy - wy * nextZoom,
        });
        return;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    addNode,
    clearSelection,
    duplicateNodes,
    pushHistory,
    redo,
    removeNodes,
    removeSelectedEdge,
    setSelection,
    undo,
    updateNodeData,
  ]);

  function zoomAt(nextZoom: number, mx?: number, my?: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      setViewport({ zoom: nextZoom });
      return;
    }
    const cx = mx ?? rect.width / 2;
    const cy = my ?? rect.height / 2;
    const wx = (cx - viewport.x) / viewport.zoom;
    const wy = (cy - viewport.y) / viewport.zoom;
    setViewport({
      zoom: nextZoom,
      x: cx - wx * nextZoom,
      y: cy - wy * nextZoom,
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextZoom = Math.min(3, Math.max(0.2, viewport.zoom * zoomFactor));
    zoomAt(nextZoom, mx, my);
  }

  function fitToContent() {
    const el = containerRef.current;
    if (!el) return;
    if (nodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
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
      Math.max(0.2, Math.min(el.clientWidth / bw, el.clientHeight / bh)),
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

  function onPointerDownBoard(e: React.PointerEvent) {
    setCtxMenu(null);
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
      // Recompute absolute positions from drag origins to avoid cumulative error.
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
        const wx = (e.clientX - rect.left - viewport.x) / viewport.zoom;
        const wy = (e.clientY - rect.top - viewport.y) / viewport.zoom;
        const hit = nodes.find((n) => {
          const w = n.width ?? 240;
          const h = n.height ?? (n.type === "text" ? 80 : 180);
          return wx >= n.x && wx <= n.x + w && wy >= n.y && wy <= n.y + h;
        });
        if (hit && hit.id !== sourceId) {
          pushHistory();
          addEdge(sourceId, hit.id);
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
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onNodePointerDown(e: React.PointerEvent, node: CanvasNode) {
    if (isPanningTool || e.button === 1) return;
    e.stopPropagation();
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

  function onContextMenu(e: React.MouseEvent) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    setCtxMenu({
      x: mx,
      y: my,
      worldX: (mx - viewport.x) / viewport.zoom,
      worldY: (my - viewport.y) / viewport.zoom,
    });
  }

  async function ingestFiles(
    files: FileList | File[],
    at?: { x: number; y: number },
  ) {
    const list = Array.from(files).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (!list.length) return;
    pushHistory();
    let i = 0;
    for (const file of list) {
      const asset = await apiUpload<{ id: string; url: string; kind: string }>(
        "/upload",
        file,
      );
      const type: CanvasNodeType = asset.kind === "video" ? "video" : "image";
      const id = addNode(type, {
        x: (at?.x ?? (-viewport.x + 280) / viewport.zoom) + i * 36,
        y: (at?.y ?? (-viewport.y + 160) / viewport.zoom) + i * 36,
      });
      updateNodeData(id, {
        url: asset.url,
        assetId: asset.id,
        status: "succeeded",
      });
      i += 1;
    }
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
    <div className="relative h-full min-h-[480px] overflow-hidden bg-[#0a0a0a]">
      <CanvasTopBar projectId={projectId} />
      <CanvasToolbar />
      <CanvasDock
        zoom={viewport.zoom}
        panMode={panMode}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        miniMapOpen={miniMapOpen}
        snapToGrid={snapToGrid}
        shortcutsOpen={shortcutsOpen}
        onPanModeChange={setPanMode}
        onZoomIn={() => zoomAt(Math.min(3, viewport.zoom * 1.1))}
        onZoomOut={() => zoomAt(Math.max(0.2, viewport.zoom * 0.9))}
        onFit={fitToContent}
        onUndo={undo}
        onRedo={redo}
        onToggleMiniMap={toggleMiniMap}
        onToggleSnap={toggleSnap}
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

      {selectedNodes.length > 1 && !isPanningTool ? (
        <MultiSelectToolbar nodes={selectedNodes} viewport={viewport} />
      ) : null}

      {selectedNodes.length === 1 && !isPanningTool ? (
        <NodeFloatToolbar
          nodes={selectedNodes}
          viewport={viewport}
          onEditImage={(id) => setEditingImageId(id)}
        />
      ) : null}

      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        style={{
          cursor:
            isPanningTool || isPanning
              ? isPanning
                ? "grabbing"
                : "grab"
              : marquee
                ? "crosshair"
                : "default",
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)",
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
        }}
        onWheel={onWheel}
        onPointerDown={onPointerDownBoard}
        onPointerMove={onPointerMoveBoard}
        onPointerUp={onPointerUpBoard}
        onContextMenu={onContextMenu}
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
            <div key={node.id}>
              <NodeView
                node={node}
                onPointerDown={onNodePointerDown}
                editingImage={editingImageId === node.id}
                onEditingImageChange={(open) =>
                  setEditingImageId(open ? node.id : null)
                }
              />
              <NodeHandles
                node={node}
                onConnectStart={onConnectStart}
              />
            </div>
          ))}
        </div>

        {marqueeStyle ? (
          <div
            className="pointer-events-none absolute z-[5] border border-violet-400/80 bg-violet-500/10"
            style={marqueeStyle}
          />
        ) : null}

        {nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center px-4 pb-28 text-center">
            <p className="text-[28px] font-medium tracking-tight text-white/25">
              右键、拖入文件或左侧工具添加节点
            </p>
            <p className="mt-2 text-sm text-white/30">
              框选多选 · 绿点拖出连线 · Space 平移 · ? 快捷键 · 磁铁吸附
            </p>
          </div>
        ) : null}
      </div>

      {ctxMenu ? (
        <div
          className="absolute z-40 min-w-[140px] overflow-hidden rounded-xl bg-[#1c1c1ef2] py-1 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {NODE_TYPE_LIST.map((item) => (
            <button
              key={item.type}
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/10"
              onClick={() => {
                pushHistory();
                addNode(item.type, { x: ctxMenu.worldX, y: ctxMenu.worldY });
                setCtxMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
