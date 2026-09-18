"use client";

import { useEffect, useMemo, useState } from "react";
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
import { groupIdOf } from "./lib/align";
import { nodeTitleLabel } from "./lib/node-chrome";
import { NODE_REGISTRY } from "./node-registry";
import {
  useCanvasRightPanelStore,
  type CanvasRightPanelMode,
} from "./right-panel-store";
import { api } from "@/shared/lib/api";
import { getJobsSocket } from "@/shared/lib/socket";
import { cn } from "@/shared/lib/utils";
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
  onFocusJob: (opts: {
    jobId?: string | null;
    assetId?: string | null;
    nodeId?: string | null;
  }) => void;
};

/** Right docked utility panel — node search + generation history (not a popover). */
export function CanvasRightPanel({
  projectId,
  nodes,
  selectedIds,
  onFocusNode,
  onFocusJob,
}: Props) {
  const mode = useCanvasRightPanelStore((s) => s.mode);
  const close = useCanvasRightPanelStore((s) => s.close);

  if (!mode) return null;

  return (
    <aside
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute bottom-4 right-4 top-16 z-40 flex w-[320px] flex-col overflow-hidden rounded-2xl border border-border"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {mode === "nodes" ? (
        <NodesPane
          nodes={nodes}
          selectedIds={selectedIds}
          onFocusNode={onFocusNode}
          onClose={close}
        />
      ) : (
        <HistoryPane
          projectId={projectId}
          onFocusJob={onFocusJob}
          onClose={close}
        />
      )}
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
    <div className="flex gap-3 overflow-x-auto px-4 pb-2 pt-1">
      {tabs.map((tab) => {
        const active = value === tab.id;
        const count = counts?.[tab.id];
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 border-b-2 pb-1.5 text-[12px] font-medium transition",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
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
  onClose,
}: {
  nodes: CanvasNode[];
  selectedIds: string[];
  onFocusNode: (id: string) => void;
  onClose: () => void;
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
    const out: ListRow[] = [];
    let groupIndex = 0;
    for (const node of visible) {
      const gid = groupIdOf(node);
      if (gid && !seenGroups.has(gid)) {
        const members = nodes.filter((n) => groupIdOf(n) === gid);
        if (members.length >= 2) {
          seenGroups.add(gid);
          groupIndex += 1;
          out.push({
            kind: "group",
            id: `group:${gid}`,
            title: `编组 ${groupIndex}`,
            subtitle: "组",
            memberIds: members.map((m) => m.id),
          });
        }
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
      <div className="flex items-center justify-between px-4 pb-1 pt-3">
        <div className="relative min-w-0 flex-1">
          <CanvasIconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点..."
            className="h-9 pl-8 text-sm"
            autoFocus
          />
        </div>
        <button
          type="button"
          title="关闭"
          aria-label="关闭"
          onClick={onClose}
          className="joy-canvas-chrome-btn ml-2 grid size-8 shrink-0 place-items-center rounded-lg"
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
                      const first = row.memberIds[0];
                      if (first) onFocusNode(first);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                      active ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid size-11 shrink-0 place-items-center rounded-xl",
                        active ? "bg-sky-500/90 text-white" : "bg-muted",
                      )}
                    >
                      <span className="absolute left-1 top-0.5 text-[9px] font-medium opacity-70">
                        {index + 1}
                      </span>
                      <CanvasIconGroup className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {row.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.subtitle}
                      </span>
                    </span>
                  </button>
                );
              }

              const { node } = row;
              const Icon = TYPE_ICON[node.type];
              const url = String(node.data.url ?? "");
              const active = selected.has(node.id);
              const showThumb =
                (node.type === "image" || node.type === "panorama") &&
                url &&
                !url.startsWith("data:");

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    <span className="absolute left-1 top-0.5 z-[1] text-[9px] font-medium text-muted-foreground">
                      {index + 1}
                    </span>
                    {showThumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon className="size-5 text-muted-foreground" />
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
}: {
  projectId: string;
  onFocusJob: (opts: {
    jobId?: string | null;
    assetId?: string | null;
    nodeId?: string | null;
  }) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<HistoryTab>("all");
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await api<{ items: HistoryJob[] }>("/jobs?take=80");
      const items = Array.isArray(res.items) ? res.items : [];
      const scoped = items.filter((job) => {
        const pid = job.canvasProjectId || job.input?.canvasProjectId;
        return pid === projectId;
      });
      setJobs([...scoped].reverse());
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const socket = getJobsSocket();
    const refresh = () => void load();
    socket.on("job:completed", refresh);
    socket.on("job:failed", refresh);
    socket.on("job:progress", refresh);
    return () => {
      socket.off("job:completed", refresh);
      socket.off("job:failed", refresh);
      socket.off("job:progress", refresh);
    };
  }, [projectId]);

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
              const thumb = job.assets?.[0]?.url;
              const media = jobMediaKind(job.kind);
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
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-muted/60"
                >
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon className="size-5 text-muted-foreground" />
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
