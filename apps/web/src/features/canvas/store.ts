"use client";

import { create } from "zustand";
import type {
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  CanvasSnapshot,
} from "@joyai/shared";
import { normalizeCanvasSnapshot } from "@joyai/shared";
import { createNodeData, nodeDefaultSize } from "./node-registry";
import { snapPoint } from "./lib/snap";
import { nodeBox } from "./lib/node-box";
import { copiedGroupId, prepareCopiedData } from "./lib/copy-node";
import {
  alignNodes,
  distributeNodes,
  groupIdOf,
  type AlignMode,
  type DistributeMode,
} from "./lib/align";

function uid(prefix = "n") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export type Viewport = { x: number; y: number; zoom: number };

type HistoryFrame = {
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

type CanvasState = {
  projectId: string | null;
  title: string;
  viewport: Viewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedIds: string[];
  selectedEdgeId: string | null;
  highlightedIds: string[];
  pulseId: string | null;
  snapToGrid: boolean;
  dirty: boolean;
  past: HistoryFrame[];
  future: HistoryFrame[];
  setProject: (id: string, title: string, snapshot?: unknown) => void;
  setTitle: (title: string) => void;
  setViewport: (viewport: Partial<Viewport>) => void;
  setSnapToGrid: (enabled: boolean) => void;
  setHighlightedIds: (ids: string[]) => void;
  select: (id: string | null, opts?: { additive?: boolean }) => void;
  setSelection: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectEdge: (id: string | null) => void;
  addNode: (type: CanvasNodeType, at?: { x: number; y: number }) => string;
  updateNode: (id: string, patch: Partial<CanvasNode>) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  /** Move these nodes to the end of the paint order, keeping their relative order. */
  raiseNodes: (ids: string[]) => void;
  resizeNode: (
    id: string,
    size: { width: number; height: number; x?: number; y?: number },
  ) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  duplicateNode: (id: string) => string | null;
  duplicateNodes: (ids: string[]) => string[];
  addEdge: (source: string, target: string) => string | null;
  removeEdge: (id: string) => void;
  removeSelectedEdge: () => void;
  alignSelection: (mode: AlignMode) => void;
  distributeSelection: (mode: DistributeMode) => void;
  groupSelection: () => string | null;
  ungroupSelection: () => void;
  expandSelectionWithGroup: (seedIds: string[]) => string[];
  focusNode: (
    id: string,
    viewportSize: { width: number; height: number },
  ) => boolean;
  focusByJobOrAsset: (
    opts: { jobId?: string | null; assetId?: string | null },
    viewportSize: { width: number; height: number },
  ) => boolean;
  markClean: () => void;
  getSnapshot: () => CanvasSnapshot;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
};

function cloneFrame(
  viewport: Viewport,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): HistoryFrame {
  return {
    viewport: { ...viewport },
    nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
    edges: edges.map((e) => ({ ...e })),
  };
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectId: null,
  title: "",
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  selectedIds: [],
  selectedEdgeId: null,
  highlightedIds: [],
  pulseId: null,
  snapToGrid: true,
  dirty: false,
  past: [],
  future: [],

  setProject: (id, title, snapshot) => {
    const normalized = snapshot
      ? normalizeCanvasSnapshot(snapshot) ?? {
          version: 2 as const,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [],
          edges: [],
        }
      : null;
    set({
      projectId: id,
      title,
      viewport: normalized?.viewport ?? { x: 0, y: 0, zoom: 1 },
      nodes: normalized?.nodes ?? [],
      edges: normalized?.edges ?? [],
      selectedIds: [],
      selectedEdgeId: null,
      highlightedIds: [],
      pulseId: null,
      dirty: false,
      past: [],
      future: [],
    });
  },

  setTitle: (title) => set({ title }),

  setViewport: (viewport) =>
    set((s) => ({
      viewport: { ...s.viewport, ...viewport },
      dirty: true,
    })),

  setSnapToGrid: (enabled) => set({ snapToGrid: enabled }),

  setHighlightedIds: (ids) => set({ highlightedIds: [...new Set(ids)] }),

  select: (id, opts) => {
    if (id == null) {
      set({ selectedIds: [], selectedEdgeId: null });
      return;
    }
    if (opts?.additive) {
      set((s) => ({
        selectedEdgeId: null,
        selectedIds: s.selectedIds.includes(id)
          ? s.selectedIds.filter((x) => x !== id)
          : [...s.selectedIds, id],
      }));
      return;
    }
    set({ selectedIds: [id], selectedEdgeId: null });
  },

  setSelection: (ids) =>
    set({ selectedIds: [...new Set(ids)], selectedEdgeId: null }),

  toggleSelect: (id) =>
    set((s) => ({
      selectedEdgeId: null,
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),

  clearSelection: () => set({ selectedIds: [], selectedEdgeId: null }),

  selectEdge: (id) =>
    set({ selectedEdgeId: id, selectedIds: id ? [] : get().selectedIds }),

  pushHistory: () => {
    const { viewport, nodes, edges, past } = get();
    set({
      past: [...past.slice(-39), cloneFrame(viewport, nodes, edges)],
      future: [],
    });
  },

  undo: () => {
    const { past, future, viewport, nodes, edges } = get();
    const prev = past[past.length - 1];
    if (!prev) return;
    set({
      past: past.slice(0, -1),
      future: [cloneFrame(viewport, nodes, edges), ...future],
      viewport: prev.viewport,
      nodes: prev.nodes,
      edges: prev.edges,
      selectedIds: [],
      selectedEdgeId: null,
      dirty: true,
    });
  },

  redo: () => {
    const { past, future, viewport, nodes, edges } = get();
    const next = future[0];
    if (!next) return;
    set({
      future: future.slice(1),
      past: [...past, cloneFrame(viewport, nodes, edges)],
      viewport: next.viewport,
      nodes: next.nodes,
      edges: next.edges,
      selectedIds: [],
      selectedEdgeId: null,
      dirty: true,
    });
  },

  addNode: (type, at) => {
    const id = uid("n");
    const vp = get().viewport;
    const size = nodeDefaultSize(type);
    let x = at?.x ?? (-vp.x + 320) / vp.zoom;
    let y = at?.y ?? (-vp.y + 180) / vp.zoom;
    if (get().snapToGrid) {
      const p = snapPoint(x, y);
      x = p.x;
      y = p.y;
    }
    const node: CanvasNode = {
      id,
      type,
      x,
      y,
      width: size.width,
      height: size.height,
      data: createNodeData(type),
    };
    set((s) => ({
      nodes: [...s.nodes, node],
      selectedIds: [id],
      selectedEdgeId: null,
      dirty: true,
    }));
    return id;
  },

  updateNode: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
      dirty: true,
    })),

  updateNodeData: (id, data) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      dirty: true,
    })),

  moveNode: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
      dirty: true,
    })),

  moveNodes: (ids, dx, dy) => {
    if (!ids.length || (dx === 0 && dy === 0)) return;
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes.map((n) =>
        idSet.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n,
      ),
      dirty: true,
    }));
  },

  raiseNodes: (ids) => {
    if (!ids.length) return;
    const idSet = new Set(ids);
    set((s) => {
      const rest: CanvasNode[] = [];
      const raised: CanvasNode[] = [];
      for (const node of s.nodes) {
        if (idSet.has(node.id)) raised.push(node);
        else rest.push(node);
      }
      if (!raised.length) return s;
      const tail = s.nodes.slice(s.nodes.length - raised.length);
      if (
        tail.length === raised.length &&
        tail.every((node, index) => node.id === raised[index]?.id)
      ) {
        return s;
      }
      return { nodes: [...rest, ...raised], dirty: true };
    });
  },

  resizeNode: (id, size) => {
    const width = Math.max(120, size.width);
    const height = Math.max(72, size.height);
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id
          ? {
              ...n,
              width,
              height,
              x: size.x ?? n.x,
              y: size.y ?? n.y,
            }
          : n,
      ),
      dirty: true,
    }));
  },

  removeNode: (id) => get().removeNodes([id]),

  removeNodes: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      nodes: s.nodes.filter((n) => !idSet.has(n.id)),
      edges: s.edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target),
      ),
      selectedIds: s.selectedIds.filter((x) => !idSet.has(x)),
      selectedEdgeId:
        s.selectedEdgeId &&
        s.edges.some(
          (e) =>
            e.id === s.selectedEdgeId &&
            (idSet.has(e.source) || idSet.has(e.target)),
        )
          ? null
          : s.selectedEdgeId,
      dirty: true,
    }));
  },

  duplicateNode: (id) => {
    const created = get().duplicateNodes([id]);
    return created[0] ?? null;
  },

  duplicateNodes: (ids) => {
    const { nodes } = get();
    const srcList = ids
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is CanvasNode => Boolean(n));
    if (!srcList.length) return [];
    const groupCache = new Map<string, string>();
    const created: CanvasNode[] = srcList.map((src) => ({
      ...src,
      id: uid("n"),
      x: src.x + 36,
      y: src.y + 36,
      data: prepareCopiedData(
        src.data,
        copiedGroupId(srcList, src, groupCache),
      ),
    }));
    const idMap = new Map(
      srcList.map((src, index) => [src.id, created[index]!.id]),
    );
    const srcIds = new Set(srcList.map((src) => src.id));
    const copiedEdges = get()
      .edges.filter(
        (edge) => srcIds.has(edge.source) && srcIds.has(edge.target),
      )
      .map((edge) => ({
        id: uid("e"),
        source: idMap.get(edge.source) ?? "",
        target: idMap.get(edge.target) ?? "",
      }))
      .filter((edge) => edge.source && edge.target);
    set((s) => ({
      nodes: [...s.nodes, ...created],
      edges: [...s.edges, ...copiedEdges],
      selectedIds: created.map((n) => n.id),
      selectedEdgeId: null,
      dirty: true,
    }));
    return created.map((n) => n.id);
  },

  addEdge: (source, target) => {
    if (source === target) return null;
    const exists = get().edges.some(
      (e) => e.source === source && e.target === target,
    );
    if (exists) return null;
    if (!get().nodes.some((n) => n.id === source)) return null;
    if (!get().nodes.some((n) => n.id === target)) return null;
    const id = uid("e");
    set((s) => ({
      edges: [...s.edges, { id, source, target }],
      dirty: true,
    }));
    return id;
  },

  removeEdge: (id) =>
    set((s) => ({
      edges: s.edges.filter((e) => e.id !== id),
      selectedEdgeId: s.selectedEdgeId === id ? null : s.selectedEdgeId,
      dirty: true,
    })),

  removeSelectedEdge: () => {
    const id = get().selectedEdgeId;
    if (id) get().removeEdge(id);
  },

  alignSelection: (mode) => {
    const ids = get().expandSelectionWithGroup(get().selectedIds);
    if (ids.length < 2) return;
    set((s) => ({
      selectedIds: ids,
      nodes: alignNodes(s.nodes, ids, mode),
      dirty: true,
    }));
  },

  distributeSelection: (mode) => {
    const ids = get().expandSelectionWithGroup(get().selectedIds);
    if (ids.length < 3) return;
    set((s) => ({
      selectedIds: ids,
      nodes: distributeNodes(s.nodes, ids, mode),
      dirty: true,
    }));
  },

  groupSelection: () => {
    const ids = get().expandSelectionWithGroup(get().selectedIds);
    if (ids.length < 2) return null;
    const { nodes } = get();
    const existing = ids
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n): n is CanvasNode => Boolean(n))
      .map((n) => groupIdOf(n));
    const first = existing[0] ?? null;
    if (
      first &&
      existing.every((g) => g === first) &&
      ids.every((id) => {
        const n = nodes.find((item) => item.id === id);
        return n && groupIdOf(n) === first;
      }) &&
      nodes.filter((n) => groupIdOf(n) === first).length === ids.length
    ) {
      set({ selectedIds: ids });
      return first;
    }
    const gid = uid("g");
    const idSet = new Set(ids);
    set((s) => ({
      selectedIds: ids,
      nodes: s.nodes.map((n) =>
        idSet.has(n.id)
          ? { ...n, data: { ...n.data, groupId: gid } }
          : n,
      ),
      dirty: true,
    }));
    return gid;
  },

  ungroupSelection: () => {
    const ids = get().selectedIds;
    if (!ids.length) return;
    const { nodes } = get();
    const groupIds = new Set(
      ids
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is CanvasNode => Boolean(n))
        .map((n) => groupIdOf(n))
        .filter((g): g is string => Boolean(g)),
    );
    if (!groupIds.size) {
      const idSet = new Set(ids);
      set((s) => ({
        nodes: s.nodes.map((n) => {
          if (!idSet.has(n.id) || !groupIdOf(n)) return n;
          const { groupId: _drop, ...rest } = n.data;
          return { ...n, data: rest };
        }),
        dirty: true,
      }));
      return;
    }
    set((s) => ({
      nodes: s.nodes.map((n) => {
        const g = groupIdOf(n);
        if (!g || !groupIds.has(g)) return n;
        const { groupId: _drop, ...rest } = n.data;
        return { ...n, data: rest };
      }),
      dirty: true,
    }));
  },

  expandSelectionWithGroup: (seedIds) => {
    const { nodes } = get();
    const out = new Set(seedIds);
    const groups = new Set(
      seedIds
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is CanvasNode => Boolean(n))
        .map((n) => groupIdOf(n))
        .filter((g): g is string => Boolean(g)),
    );
    if (groups.size) {
      for (const n of nodes) {
        const g = groupIdOf(n);
        if (g && groups.has(g)) out.add(n.id);
      }
    }
    return [...out];
  },

  focusNode: (id, viewportSize) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return false;
    const box = nodeBox(node);
    const zoom = get().viewport.zoom;
    set({
      selectedIds: [id],
      selectedEdgeId: null,
      pulseId: id,
      viewport: {
        x: viewportSize.width / 2 - (box.x + box.width / 2) * zoom,
        y: viewportSize.height / 2 - (box.y + box.height / 2) * zoom,
        zoom,
      },
      dirty: true,
    });
    window.setTimeout(() => {
      if (get().pulseId === id) set({ pulseId: null });
    }, 1600);
    return true;
  },

  focusByJobOrAsset: (opts, viewportSize) => {
    const { nodes } = get();
    let target: CanvasNode | undefined;
    if (opts.jobId) {
      target = nodes.find((n) => String(n.data.jobId ?? "") === opts.jobId);
    }
    if (!target && opts.assetId) {
      target = nodes.find(
        (n) => String(n.data.assetId ?? "") === opts.assetId,
      );
    }
    if (!target) return false;
    return get().focusNode(target.id, viewportSize);
  },

  markClean: () => set({ dirty: false }),

  getSnapshot: () => {
    const { viewport, nodes, edges } = get();
    const safeNodes = nodes.map((n) => {
      const url = n.data.url;
      if (typeof url === "string" && url.startsWith("data:")) {
        const { url: _drop, ...rest } = n.data;
        return { ...n, data: { ...rest, url: "" } };
      }
      return n;
    });
    const nodeIds = new Set(safeNodes.map((n) => n.id));
    return {
      version: 2 as const,
      viewport,
      nodes: safeNodes,
      edges: edges.filter(
        (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
      ),
    };
  },
}));

export function useIsNodeSelected(id: string) {
  return useCanvasStore((s) => s.selectedIds.includes(id));
}

export function useIsNodeHighlighted(id: string) {
  return useCanvasStore((s) => s.highlightedIds.includes(id));
}

export function useIsNodePulsing(id: string) {
  return useCanvasStore((s) => s.pulseId === id);
}
