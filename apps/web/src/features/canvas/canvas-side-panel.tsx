"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNode, CanvasNodeType } from "@joyai/shared";
import {
  Image as ImageIcon,
  Link2,
  PanelLeftClose,
  Search,
  Sparkles,
  Type,
  Upload,
  Video,
} from "lucide-react";
import Link from "next/link";
import { NODE_REGISTRY } from "./node-registry";
import { nodeTitleLabel } from "./lib/node-chrome";
import { useCanvasSidePanelStore } from "./side-panel-store";
import { api, apiUpload } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type PanelTab = "canvas" | "materials" | "prompts";

type AssetRow = {
  id: string;
  kind: string;
  url: string;
  jobId?: string | null;
  createdAt?: string;
};

const TYPE_ICON: Record<CanvasNodeType, typeof Type> = {
  text: Type,
  image: ImageIcon,
  video: Video,
  prompt: Sparkles,
};

const TYPE_FILTERS: { id: "all" | CanvasNodeType; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "text", label: "文本" },
  { id: "image", label: "图像" },
  { id: "video", label: "视频" },
  { id: "prompt", label: "提示词" },
];

type Props = {
  nodes: CanvasNode[];
  selectedIds: string[];
  onFocusNode: (id: string) => void;
  onInsertAsset: (asset: { id: string; url: string; kind: string }) => void;
  onAddPrompt: (text?: string) => void;
};

export function CanvasSidePanel({
  nodes,
  selectedIds,
  onFocusNode,
  onInsertAsset,
  onAddPrompt,
}: Props) {
  const open = useCanvasSidePanelStore((s) => s.open);
  const width = useCanvasSidePanelStore((s) => s.width);
  const setWidth = useCanvasSidePanelStore((s) => s.setWidth);
  const persistWidth = useCanvasSidePanelStore((s) => s.persistWidth);
  const setOpen = useCanvasSidePanelStore((s) => s.setOpen);
  const [tab, setTab] = useState<PanelTab>("canvas");

  if (!open) return null;

  return (
    <aside
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome relative z-40 flex h-full shrink-0 flex-col border-r border-border"
      style={{ width }}
    >
      <div className="flex items-center gap-4 px-4 pt-3.5">
        {(
          [
            ["canvas", "画布"],
            ["materials", "素材"],
            ["prompts", "提示词"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "relative pb-1.5 text-sm font-semibold transition",
              tab === id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {tab === id ? (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground" />
            ) : null}
          </button>
        ))}
        <button
          type="button"
          title="收起侧栏"
          aria-label="收起侧栏"
          className="joy-canvas-chrome-btn ml-auto grid size-8 place-items-center rounded-lg"
          onClick={() => setOpen(false)}
        >
          <PanelLeftClose className="size-4" />
        </button>
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-hidden">
        {tab === "canvas" ? (
          <CanvasNodesTab
            nodes={nodes}
            selectedIds={selectedIds}
            onFocusNode={onFocusNode}
          />
        ) : tab === "materials" ? (
          <MaterialsTab onInsert={onInsertAsset} />
        ) : (
          <PromptsTab
            nodes={nodes}
            onAddPrompt={onAddPrompt}
            onFocusNode={onFocusNode}
          />
        )}
      </div>

      <button
        type="button"
        aria-label="调整侧栏宽度"
        className="absolute inset-y-0 right-0 z-10 w-1.5 translate-x-1/2 cursor-col-resize"
        onPointerDown={(e) => {
          e.preventDefault();
          const startX = e.clientX;
          const startW = width;
          const onMove = (ev: PointerEvent) => {
            setWidth(startW + ev.clientX - startX);
          };
          const onUp = () => {
            persistWidth();
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        }}
      />
    </aside>
  );
}

function CanvasNodesTab({
  nodes,
  selectedIds,
  onFocusNode,
}: {
  nodes: CanvasNode[];
  selectedIds: string[];
  onFocusNode: (id: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CanvasNodeType>("all");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return nodes.filter((n) => {
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
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
  }, [nodes, keyword, typeFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        <span className="text-xs font-medium text-muted-foreground">
          画布元素
        </span>
        {filtered.length ? (
          <span className="text-xs text-muted-foreground/60">
            {filtered.length}
          </span>
        ) : null}
        <select
          className="ml-auto h-7 rounded-md border-0 bg-transparent text-xs text-muted-foreground outline-none"
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as "all" | CanvasNodeType)
          }
        >
          {TYPE_FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <div className="px-3 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索节点"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            画布暂无节点
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((node) => {
              const Icon = TYPE_ICON[node.type];
              const url = String(node.data.url ?? "");
              const active = selected.has(node.id);
              const title = nodeTitleLabel(node.type, node.data);
              const sub =
                node.type === "prompt"
                  ? String(node.data.prompt ?? "").trim() ||
                    NODE_REGISTRY.prompt.label
                  : node.type === "text"
                    ? String(node.data.text ?? "").trim() ||
                      NODE_REGISTRY.text.label
                    : NODE_REGISTRY[node.type].label;
              return (
                <button
                  key={node.id}
                  type="button"
                  title="定位到节点"
                  onClick={() => onFocusNode(node.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition",
                    active ? "bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                    {node.type === "image" && url && !url.startsWith("data:") ? (
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
                      {title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sub}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function MaterialsTab({
  onInsert,
}: {
  onInsert: (asset: { id: string; url: string; kind: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [keyword, setKeyword] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const rows = await api<AssetRow[]>("/assets?take=120");
      // 画布素材 = 上传参考料（无 job）；生成资产在 /assets 页查看
      const materials = (Array.isArray(rows) ? rows : []).filter(
        (a) =>
          !a.jobId &&
          (a.kind === "image" || a.kind === "video"),
      );
      setItems(materials);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (a) => a.id.toLowerCase().includes(q) || a.kind.includes(q),
    );
  }, [items, keyword]);

  async function onUploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (
          !file.type.startsWith("image/") &&
          !file.type.startsWith("video/")
        ) {
          continue;
        }
        const asset = await apiUpload<{
          id: string;
          url: string;
          kind: string;
        }>("/upload", file);
        onInsert({
          id: asset.id,
          url: asset.url,
          kind: asset.kind,
        });
      }
      await reload();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2 pt-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">画布素材</p>
          <button
            type="button"
            disabled={uploading}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3.5" />
            {uploading ? "上传中…" : "上传"}
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/75">
          这里是上传的参考图/视频，不是 AI 生成结果。生成资产请到
          <Link
            href="/assets"
            className="mx-0.5 inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
          >
            资产页
            <Link2 className="size-3" />
          </Link>
          查看。
        </p>
      </div>
      <div className="px-3 pb-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索素材"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {loading ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            加载中…
          </p>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            <p>暂无上传素材</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
              onClick={() => fileRef.current?.click()}
            >
              上传参考图 / 视频
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map((asset) => (
              <button
                key={asset.id}
                type="button"
                title="插入到画布"
                onClick={() =>
                  onInsert({
                    id: asset.id,
                    url: asset.url,
                    kind: asset.kind,
                  })
                }
                className="overflow-hidden rounded-lg border border-border bg-muted/40 transition hover:border-foreground/30"
              >
                {asset.kind === "video" ? (
                  <div className="flex aspect-square items-center justify-center bg-muted">
                    <Video className="size-6 text-muted-foreground" />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt=""
                    className="aspect-square w-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => void onUploadFiles(e.target.files)}
      />
    </div>
  );
}

function PromptsTab({
  nodes,
  onAddPrompt,
  onFocusNode,
}: {
  nodes: CanvasNode[];
  onAddPrompt: (text?: string) => void;
  onFocusNode: (id: string) => void;
}) {
  const prompts = useMemo(
    () => nodes.filter((n) => n.type === "prompt"),
    [nodes],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-1">
        <span className="text-xs font-medium text-muted-foreground">
          画布提示词
        </span>
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
          onClick={() => onAddPrompt()}
        >
          + 新建
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
        {prompts.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-muted-foreground">
            <p>暂无提示词节点</p>
            <button
              type="button"
              className="mt-3 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground"
              onClick={() => onAddPrompt()}
            >
              添加提示词节点
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {prompts.map((node) => {
              const text = String(node.data.prompt ?? "").trim();
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onFocusNode(node.id)}
                  className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/60"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-muted">
                    <Sparkles className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      提示词
                    </span>
                    <span className="block line-clamp-2 text-xs text-muted-foreground">
                      {text || "（空）"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
