"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { NODE_REGISTRY } from "./node-registry";

type Props = {
  node: CanvasNode | null;
  open: boolean;
  onClose: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  idle: "空闲",
  queued: "排队中",
  running: "生成中",
  succeeded: "完成",
  failed: "失败",
};

export function NodeInfoDialog({ node, open, onClose }: Props) {
  const [view, setView] = useState<"info" | "json">("info");

  useEffect(() => {
    if (open) setView("info");
  }, [node?.id, open]);

  const json = useMemo(() => {
    if (!node) return "";
    return JSON.stringify(
      node,
      (key, value) => {
        if (
          typeof value === "string" &&
          (value.startsWith("data:") || value.length > 4000)
        ) {
          return key === "url" || key === "prompt" || key === "text"
            ? `${value.slice(0, 180)}…`
            : `[omitted ${value.length} chars]`;
        }
        return value;
      },
      2,
    );
  }, [node]);

  const prompt = String(node?.data.prompt ?? node?.data.text ?? "").trim();
  const status = String(node?.data.status ?? "idle");
  const assetId = String(node?.data.assetId ?? "");
  const error = String(node?.data.error ?? "");
  const title = String(node?.data.title ?? "");

  return (
    <Dialog
      open={open && Boolean(node)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-canvas-no-zoom
        data-canvas-shortcuts-ignore
        className="max-w-lg"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>节点信息</DialogTitle>
            <div className="flex rounded-md border p-0.5 text-xs">
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1",
                  view === "info" && "bg-muted",
                )}
                onClick={() => setView("info")}
              >
                信息
              </button>
              <button
                type="button"
                className={cn(
                  "rounded px-2 py-1",
                  view === "json" && "bg-muted",
                )}
                onClick={() => setView("json")}
              >
                JSON
              </button>
            </div>
          </div>
          <DialogDescription>只读查看，不会改快照。</DialogDescription>
        </DialogHeader>
        {node ? (
          view === "info" ? (
            <div className="max-h-[56vh] space-y-3 overflow-auto text-sm">
              <Row label="ID" value={node.id} />
              <Row
                label="类型"
                value={NODE_REGISTRY[node.type]?.label ?? node.type}
              />
              {title ? <Row label="名称" value={title} /> : null}
              <Row
                label="尺寸"
                value={`${Math.round(node.width ?? 0)} × ${Math.round(node.height ?? 0)}`}
              />
              <Row
                label="位置"
                value={`${Math.round(node.x)}, ${Math.round(node.y)}`}
              />
              <Row label="状态" value={STATUS_LABEL[status] ?? status} />
              {assetId ? <Row label="素材" value={assetId} /> : null}
              {prompt ? <Row label="文案" value={prompt} /> : null}
              {error ? (
                <div className="rounded-md border border-destructive/40 p-3 text-destructive">
                  {error}
                </div>
              ) : null}
            </div>
          ) : (
            <pre className="max-h-[56vh] overflow-auto rounded-md border bg-muted/40 p-3 text-xs leading-5">
              {json}
            </pre>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
    </div>
  );
}
