"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import {
  CanvasIconAudio,
  CanvasIconClose,
  CanvasIconDirector,
  CanvasIconGroup,
  CanvasIconImage,
  CanvasIconLoader,
  CanvasIconPanorama,
  CanvasIconPrompt,
  CanvasIconSearch,
  CanvasIconText,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { groupIdOf, groupLabels } from "./lib/align";
import { nodeTitleLabel } from "./lib/node-chrome";
import { NODE_REGISTRY } from "./node-registry";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import {
  CanvasHoverPreview,
  type HoverPreviewPayload,
} from "./canvas-hover-preview";
import {
  useCanvasRightPanelStore,
  type CanvasRightPanelMode,
} from "./right-panel-store";
import { Crosshair } from "lucide-react";
import { api } from "@/shared/lib/api";
import { useJobLifecycle } from "@/shared/lib/use-job-lifecycle";
import { cn } from "@/shared/lib/utils";
import { JoyAssetThumb } from "@/shared/ui/joy-asset-thumb";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type IconComp = (props: { className?: string }) => React.ReactNode;

const TYPE_ICON: Record<CanvasNodeType, IconComp> = {
  text: CanvasIconText,
  image: CanvasIconImage,
  video: CanvasIconVideo,
  prompt: CanvasIconPrompt,
  panorama: CanvasIconPanorama,
  audio: CanvasIconAudio,
  director: CanvasIconDirector,
};

type NodeTab = "all" | "image" | "video" | "audio" | "text";

const NODE_TABS: { id: NodeTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
  { id: "text", label: "文本" },
];

type HistoryTab = "all" | "image" | "video" | "audio";

const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

type HistoryJob = {
  id: string;
  kind: string;
  status: string;
  progress?: number;
  createdAt: string;
  error?: string | null;
  canvasProjectId?: string | null;
  canvasNodeId?: string | null;
  input?: {
    prompt?: string;
    canvasProjectId?: string;
    canvasNodeId?: string;
  };
  assets?: { id: string; url: string }[];
};

type ListRow =
  | {
      kind: "node";
      id: string;
      node: CanvasNode;
      title: string;
      subtitle: string;
    }
  | {
      kind: "group";
      id: string;
      title: string;
      subtitle: string;
      memberIds: string[];
    };

function matchesNodeTab(type: CanvasNodeType, tab: NodeTab) {
  if (tab === "all") return true;
  if (tab === "image") return type === "image" || type === "panorama";
  return type === tab;
}

function jobMediaKind(kind: string): HistoryTab | "other" {
  const k = kind.toLowerCase();
  if (k.includes("video")) return "video";
  if (k.includes("audio") || k.includes("speech") || k.includes("tts"))
    return "audio";
  if (k.includes("image") || k.includes("panorama")) return "image";
  return "other";
}

type Props = {
  projectId: string;
  nodes: CanvasNode[];
  selectedIds: string[];
  onFocusNode: (id: string) => void;
  onFocusGroup?: (memberIds: string[]) => void;
  onFocusJob: (opts: {
    jobId?: string | null;
    assetId?: string | null;
    nodeId?: string | null;
  }) => void;
};

/** Floating right utility panel — node search + history (not full-height). */
export function CanvasRightPanel({
  projectId,
  nodes,
  selectedIds,
  onFocusNode,
  onFocusGroup,
  onFocusJob,
}: Props) {
  const mode = useCanvasRightPanelStore((s) => s.mode);
  const close = useCanvasRightPanelStore((s) => s.close);
  const panelRef = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<HoverPreviewPayload | null>(null);

  useEffect(() => {
    setPreview(null);
  }, [mode]);

  useEffect(() => {
    if (!mode || mode === "agent") return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (target.closest("[data-canvas-right-toggle]")) return;
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [mode, close]);

  if (!mode || mode === "agent") return null;

  return (
    <aside
      ref={panelRef}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute right-4 top-16 z-40 flex h-[min(560px,calc(100%-7.5rem))] w-[320px] flex-col overflow-visible rounded-2xl border border-border shadow-lg"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerLeave={() => setPreview(null)}
    >
      <CanvasHoverPreview preview={preview} className="top-0" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl">
        {mode === "nodes" ? (
          <NodesPane
            nodes={nodes}
            selectedIds={selectedIds}
            onFocusNode={onFocusNode}
            onFocusGroup={onFocusGroup}
            onClose={close}
            onHoverPreview={setPreview}
          />
        ) : (
          <HistoryPane
            projectId={projectId}
            onFocusJob={onFocusJob}
            onClose={close}
            onHoverPreview={setPreview}
          />
        )}
      </div>
    </aside>
  );
}

function PanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
      <h2 className="text-sm font-semibold tracking-wide">{title}</h2>
      <button
        type="button"
        title="关闭"
        aria-label="关闭"
        onClick={onClose}
        className="joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg"
      >
        <CanvasIconClose className="size-3.5" />
      </button>
    </div>
  );
}

function TabRow<T extends string>({
  tabs,
  value,
  counts,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  counts?: Partial<Record<T, number>>;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-3.5 overflow-x-auto px-4 pb-2.5 pt-1">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 text-[12px] font-medium transition",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/80",
            )}
          >
            {tab.label}
            {typeof count === "number" ? (
              <span className="ml-1 tabular-nums opacity-70">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function NodesPane({
  nodes,
  selectedIds,
  onFocusNode,
  onFocusGroup,
  onClose,
  onHoverPreview,
}: {
  nodes: CanvasNode[];
  selectedIds: string[];
  onFocusNode: (id: string) => void;
  onFocusGroup?: (memberIds: string[]) => void;
  onClose: () => void;
  onHoverPreview: (preview: HoverPreviewPayload | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [tab, setTab] = useState<NodeTab>("all");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const counts = useMemo(() => {
    const next: Partial<Record<NodeTab, number>> = {
      all: nodes.length,
      image: 0,
      video: 0,
      audio: 0,
      text: 0,
    };
    for (const node of nodes) {
      if (matchesNodeTab(node.type, "image")) next.image = (next.image ?? 0) + 1;
      if (matchesNodeTab(node.type, "video")) next.video = (next.video ?? 0) + 1;
      if (matchesNodeTab(node.type, "audio")) next.audio = (next.audio ?? 0) + 1;
      if (matchesNodeTab(node.type, "text")) next.text = (next.text ?? 0) + 1;
    }
    return next;
  }, [nodes]);

  const rows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    const scoped = nodes.filter((n) => matchesNodeTab(n.type, tab));
    const visible = scoped.filter((n) => {
      if (!q) return true;
      const hay = [
        NODE_REGISTRY[n.type].label,
        nodeTitleLabel(n.type, n.data),
        String(n.data.text ?? ""),
        String(n.data.prompt ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const seenGroups = new Set<string>();
    const labels = groupLabels(nodes);
    const out: ListRow[] = [];
    for (const node of visible) {
      const gid = groupIdOf(node);
      if (gid && !seenGroups.has(gid) && labels.has(gid)) {
        const members = nodes.filter((n) => groupIdOf(n) === gid);
        seenGroups.add(gid);
        out.push({
          kind: "group",
          id: `group:${gid}`,
          title: labels.get(gid) ?? "编组",
          subtitle: "组",
          memberIds: members.map((m) => m.id),
        });
      }
      out.push({
        kind: "node",
        id: node.id,
        node,
        title: nodeTitleLabel(node.type, node.data),
        subtitle: NODE_REGISTRY[node.type].label.replace("图像", "图片"),
      });
    }
    return out;
  }, [nodes, keyword, tab]);

  return (
    <>
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <div className="relative min-w-0 flex-1">
          <CanvasIconSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点..."
            className="h-9 rounded-full border-border/70 bg-muted/40 pl-9 text-sm shadow-none"
            autoFocus
          />
        </div>
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
          className="joy-canvas-chrome-btn grid size-8 shrink-0 place-items-center rounded-full"
        >
          <CanvasIconClose className="size-3.5" />
        </button>
      </div>
      <TabRow tabs={NODE_TABS} value={tab} counts={counts} onChange={setTab} />
      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {rows.length === 0 ? (
          <p className="px-2 py-10 text-center text-xs text-muted-foreground">
            暂无匹配节点
          </p>
        ) : (
          <div className="space-y-0.5">
            {rows.map((row, index) => {
              if (row.kind === "group") {
                const active = row.memberIds.some((id) => selected.has(id));
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      if (onFocusGroup) onFocusGroup(row.memberIds);
                      else {
                        const first = row.memberIds[0];
                        if (first) onFocusNode(first);
                      }
                    }}
                    onPointerEnter={() =>
                      onHoverPreview({
                        title: row.title,
                        kind: "other",
                        icon: <CanvasIconGroup className="size-8 opacity-70" />,
                      })
                    }
                    onPointerLeave={() => onHoverPreview(null)}
                    className={cn(
                      "group/row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                      active ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid size-10 shrink-0 place-items-center rounded-lg",
                        active
                          ? "bg-sky-500/90 text-white"
                          : "bg-sky-500/15 text-sky-600 dark:text-sky-300",
                      )}
                    >
                      <span className="absolute left-1 top-0.5 text-[9px] font-medium opacity-70">
                        {index + 1}
                      </span>
                      <CanvasIconGroup className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {row.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.subtitle}
                      </span>
                    </span>
                    <Crosshair className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition group-hover/row:opacity-90" />
                  </button>
                );
              }

              const { node } = row;
              const Icon = TYPE_ICON[node.type];
              const url = String(node.data.url ?? "");
              const active = selected.has(node.id);
              const showThumb =
                (node.type === "image" ||
                  node.type === "panorama" ||
                  node.type === "video") &&
                Boolean(url) &&
                !url.startsWith("data:");

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  onPointerEnter={() =>
                    onHoverPreview({
                      title: row.title,
                      kind:
                        node.type === "video"
                          ? "video"
                          : node.type === "audio"
                            ? "audio"
                            : node.type === "image" || node.type === "panorama"
                              ? "image"
                              : "other",
                      url: showThumb ? url : undefined,
                      icon: <Icon className="size-8 opacity-70" />,
                    })
                  }
                  onPointerLeave={() => onHoverPreview(null)}
                  className={cn(
                    "group/row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                    <span className="absolute left-1 top-0.5 z-[1] text-[9px] font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    {showThumb ? (
                      <CanvasRefThumb kind={node.type} url={url} />
                    ) : (
                      <Icon className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {row.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.subtitle}
                    </span>
                  </span>
                  <Crosshair className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition group-hover/row:opacity-90" />
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

function HistoryPane({
  projectId,
  onFocusJob,
  onClose,
  onHoverPreview,
}: {
  projectId: string;
  onFocusJob: (opts: {
    jobId?: string | null;
    assetId?: string | null;
    nodeId?: string | null;
  }) => void;
  onClose: () => void;
  onHoverPreview: (preview: HoverPreviewPayload | null) => void;
}) {
  const [tab, setTab] = useState<HistoryTab>("all");
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  async function load() {
    try {
      const qs = new URLSearchParams({
        take: "80",
        scope: "canvas",
        canvasProjectId: projectId,
      });
      const res = await api<{ items: HistoryJob[] }>(`/jobs?${qs}`);
      const items = Array.isArray(res.items) ? res.items : [];
      setJobs([...items].reverse());
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [projectId]);

  useJobLifecycle({
    getBusyJobIds: () =>
      jobsRef.current
        .filter((j) =>
          ["queued", "running", "polling"].includes(j.status),
        )
        .map((j) => j.id),
    onProgress: (payload) => {
      if (!payload.jobId) return;
      setJobs((prev) => {
        const idx = prev.findIndex((job) => job.id === payload.jobId);
        if (idx < 0) return prev;
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          status: payload.status ?? copy[idx].status,
          progress:
            typeof payload.progress === "number"
              ? payload.progress
              : copy[idx].progress,
        };
        return copy;
      });
    },
    onCompleted: () => {
      void load();
    },
    onFailed: () => {
      void load();
    },
  });

  const filtered = useMemo(() => {
    if (tab === "all") return jobs;
    return jobs.filter((job) => jobMediaKind(job.kind) === tab);
  }, [jobs, tab]);

  return (
    <>
      <PanelHeader title="生成历史" onClose={onClose} />
      <TabRow tabs={HISTORY_TABS} value={tab} onChange={setTab} />
      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <CanvasIconLoader className="size-4 animate-spin" />
            加载中…
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-16 text-center text-sm text-muted-foreground">
            暂无生成历史
          </p>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((job) => {
              const media = jobMediaKind(job.kind);
              const thumb = job.assets?.[0]?.url;
              const Icon =
                media === "video"
                  ? CanvasIconVideo
                  : media === "audio"
                    ? CanvasIconAudio
                    : CanvasIconImage;
              const prompt = String(job.input?.prompt ?? "").trim();
              const title = prompt
                ? prompt.slice(0, 36)
                : media === "video"
                  ? "视频任务"
                  : media === "audio"
                    ? "音频任务"
                    : "图片任务";
              const nodeId = job.canvasNodeId || job.input?.canvasNodeId || null;
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() =>
                    onFocusJob({
                      jobId: job.id,
                      assetId: job.assets?.[0]?.id ?? null,
                      nodeId,
                    })
                  }
                  onPointerEnter={() =>
                    onHoverPreview({
                      title,
                      kind:
                        media === "video"
                          ? "video"
                          : media === "audio"
                            ? "audio"
                            : "image",
                      url: thumb,
                      icon: <Icon className="size-8 opacity-70" />,
                    })
                  }
                  onPointerLeave={() => onHoverPreview(null)}
                  className="group/row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted/60"
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                    {thumb ? (
                      media === "image" ? (
                        <JoyAssetThumb
                          url={thumb}
                          size="sm"
                          className="size-full object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumb}
                          alt=""
                          className="size-full object-cover"
                        />
                      )
                    ) : (
                      <Icon className="size-4 text-muted-foreground" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {job.status}
                      {job.error ? ` · ${job.error}` : ""}
                    </span>
                  </span>
                  <Crosshair className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition group-hover/row:opacity-90" />
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </>
  );
}

export type { CanvasRightPanelMode };
