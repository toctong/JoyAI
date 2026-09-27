"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import { History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/lib/toast";
import {
  readGenHistory,
  restoreNodeMedia,
  siblingResultVersions,
  type NodeGenVersion,
} from "./lib/node-gen-history";
import { useCanvasStore } from "./store";
import { CanvasRefThumb } from "./canvas-ref-thumb";

type JobRow = {
  id: string;
  status: string;
  createdAt: string;
  input?: { prompt?: string };
  assets?: { id: string; url: string }[];
};

type VersionRow = NodeGenVersion & {
  key: string;
  active: boolean;
  source: "current" | "history" | "job" | "sibling";
};

type Props = {
  node: CanvasNode | null;
  projectId: string;
  open: boolean;
  onClose: () => void;
};

function formatTime(iso: string) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NodeGenHistoryDialog({
  node,
  projectId,
  open,
  onClose,
}: Props) {
  const liveNode = useCanvasStore((s) =>
    node ? s.nodes.find((item) => item.id === node.id) ?? null : null,
  );
  const [jobVersions, setJobVersions] = useState<NodeGenVersion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !node || !projectId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          take: "40",
          scope: "canvas",
          canvasProjectId: projectId,
          canvasNodeId: node.id,
        });
        const res = await api<{ items: JobRow[] }>(`/jobs?${qs}`);
        if (cancelled) return;
        const items = Array.isArray(res.items) ? res.items : [];
        const versions: NodeGenVersion[] = [];
        const seen = new Set<string>();
        for (const job of items) {
          if (job.status !== "succeeded") continue;
          for (const asset of job.assets ?? []) {
            if (!asset?.id || !asset?.url || seen.has(asset.id)) continue;
            seen.add(asset.id);
            versions.push({
              assetId: asset.id,
              url: asset.url,
              jobId: job.id,
              createdAt: job.createdAt,
              prompt: String(job.input?.prompt ?? "").trim() || undefined,
            });
          }
        }
        setJobVersions(versions);
      } catch {
        if (!cancelled) setJobVersions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, node?.id, projectId]);

  const rows = useMemo(() => {
    if (!liveNode) return [] as VersionRow[];
    const currentUrl = String(liveNode.data.url ?? "").trim();
    const currentAssetId = String(liveNode.data.assetId ?? "").trim();
    const current: NodeGenVersion | null =
      currentUrl && !currentUrl.startsWith("data:") && currentAssetId
        ? {
            assetId: currentAssetId,
            url: currentUrl,
            jobId: String(liveNode.data.jobId ?? "").trim() || undefined,
            createdAt: new Date().toISOString(),
            prompt:
              String(liveNode.data.prompt ?? liveNode.data.genDraft ?? "").trim() ||
              undefined,
          }
        : null;

    const seen = new Set<string>();
    const out: VersionRow[] = [];
    const push = (
      ver: NodeGenVersion,
      source: VersionRow["source"],
      active = false,
    ) => {
      if (!ver.assetId || seen.has(ver.assetId)) return;
      seen.add(ver.assetId);
      out.push({
        ...ver,
        key: `${source}-${ver.assetId}`,
        active,
        source,
      });
    };

    if (current) push(current, "current", true);
    for (const ver of readGenHistory(liveNode.data)) {
      push(ver, "history");
    }
    for (const ver of jobVersions) {
      push(ver, "job");
    }
    for (const ver of siblingResultVersions(liveNode.id)) {
      push(ver, "sibling");
    }
    return out;
  }, [liveNode, jobVersions]);

  function apply(ver: NodeGenVersion) {
    if (!liveNode) return;
    if (ver.assetId === String(liveNode.data.assetId ?? "")) {
      toast.message("已是当前版本");
      return;
    }
    restoreNodeMedia(liveNode.id, ver);
    toast.success("已切换到该版本");
  }

  const title = String(liveNode?.data.title ?? "").trim() || "未命名节点";
  const kind =
    liveNode?.type === "video"
      ? "视频"
      : liveNode?.type === "audio"
        ? "音频"
        : liveNode?.type === "panorama"
          ? "全景"
          : "图片";

  return (
    <Dialog
      open={open && Boolean(liveNode)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="flex h-[min(640px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4 opacity-70" />
            节点生成历史
          </DialogTitle>
          <DialogDescription>
            {kind} · {title}
            {" · "}
            仅本节点的历代生成，点击即可恢复
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 px-5 py-4">
          {loading && rows.length <= 1 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              加载中…
            </p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              暂无生成记录。对本节点再生成一次后，旧版本会出现在这里。
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {rows.map((row, index) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => apply(row)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border bg-muted/30 text-left transition",
                      row.active
                        ? "border-primary ring-2 ring-primary/30"
                        : "hover:border-foreground/25 hover:bg-muted/50",
                    )}
                  >
                    <div className="relative aspect-square overflow-hidden bg-muted">
                      <CanvasRefThumb
                        kind={liveNode?.type ?? "image"}
                        url={row.url}
                        className="h-full w-full"
                      />
                      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        #{index + 1}
                      </span>
                      {row.active ? (
                        <span className="absolute right-2 top-2 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                          当前
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-0.5 px-2.5 py-2">
                      <p className="truncate text-xs font-medium">
                        {row.active ? "当前版本" : "点击恢复"}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {formatTime(row.createdAt) || "—"}
                        {row.prompt ? ` · ${row.prompt}` : ""}
                      </p>
                    </div>
                  </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
