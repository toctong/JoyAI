"use client";

import {
  CanvasIconCamera,
  CanvasIconClose,
  CanvasIconMaximize,
  CanvasIconPanorama,
  CanvasIconRetry,
} from "../icons/canvas-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CanvasNode } from "@joyai/shared";
import {
  useCanvasStore,
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import {
  MediaBusyState,
  MediaUploadLabel,
  mediaBusyLabel,
} from "../media-upload-label";
import { isBusyStatus } from "../node-registry";
import { cancelNodeJob } from "../lib/cancel-node-job";
import {
  PanoramaViewer,
  canvasToPngFile,
  type PanoramaViewerApi,
  type PanoramaView,
} from "../panorama-viewer";
import { nodeBox } from "../lib/node-box";
import { uploadFileToNewNode } from "../lib/upload-to-node";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

/** Cap simultaneous WebGL previews on the board (immersive always wins). */
const LIVE_PREVIEW_LIMIT = 3;

type PreviewEntry = {
  id: string;
  setActive: (active: boolean) => void;
};

const activePreviews: PreviewEntry[] = [];

function releasePreview(entry: PreviewEntry) {
  const index = activePreviews.indexOf(entry);
  if (index >= 0) activePreviews.splice(index, 1);
}

function claimPreview(entry: PreviewEntry, force: boolean) {
  const existing = activePreviews.indexOf(entry);
  if (existing >= 0) {
    activePreviews.splice(existing, 1);
    activePreviews.push(entry);
    entry.setActive(true);
    return true;
  }
  if (activePreviews.length >= LIVE_PREVIEW_LIMIT) {
    if (!force) {
      entry.setActive(false);
      return false;
    }
    activePreviews.shift()?.setActive(false);
  }
  activePreviews.push(entry);
  entry.setActive(true);
  return true;
}

export function PanoramaNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const [immersive, setImmersive] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [livePreview, setLivePreview] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const apiRef = useRef<PanoramaViewerApi | null>(null);
  const entryRef = useRef<PreviewEntry | null>(null);

  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");
  const busy = isBusyStatus(status);
  const canCancel =
    busy && Boolean(String(node.data.jobId ?? "").trim());
  const onCancel = canCancel
    ? () => void cancelNodeJob(node.id)
    : undefined;
  const wantLive = framed && (selected || hovered || immersive);
  /** Immersive owns its own WebGL; the node shows the sphere, not the flat source. */
  const showNodeViewer = livePreview && !immersive;

  useEffect(() => {
    const entry: PreviewEntry = {
      id: node.id,
      setActive: setLivePreview,
    };
    entryRef.current = entry;
    return () => {
      releasePreview(entry);
      if (entryRef.current === entry) entryRef.current = null;
    };
  }, [node.id]);

  useEffect(() => {
    const entry = entryRef.current;
    if (!entry) return;
    if (!wantLive) {
      releasePreview(entry);
      setLivePreview(false);
      return;
    }
    claimPreview(entry, immersive || selected);
  }, [immersive, selected, wantLive]);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeImmersive();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immersive]);

  const persistView = useCallback(
    (view?: PanoramaView) => {
      const next = view ?? apiRef.current?.getView();
      if (!next) return;
      updateNodeData(node.id, { lastView: next });
    },
    [node.id, updateNodeData],
  );

  function closeImmersive() {
    persistView();
    setImmersive(false);
  }

  const onReady = useCallback((api: PanoramaViewerApi) => {
    apiRef.current = api;
  }, []);

  async function captureView() {
    const api = apiRef.current;
    if (!api || capturing) return;
    setCapturing(true);
    const toastId = toast.loading("正在截取当前视角…");
    try {
      const canvas = await api.captureCanvas();
      if (!canvas) throw new Error("截图失败");
      pushHistory();
      const file = await canvasToPngFile(
        canvas,
        `panorama-view-${node.id.slice(0, 6)}.png`,
      );
      const box = nodeBox(node);
      const imageId = await uploadFileToNewNode(
        file,
        {
          x: box.x + box.width + 40,
          y: box.y,
        },
        {
          history: false,
          preferredType: "image",
          title: "全景截帧",
        },
      );
      addEdge(node.id, imageId);
      const view = api?.getView();
      if (view) {
        updateNodeData(node.id, {
          lastView: view,
        });
      }
      toast.success("已把当前视角落到画布", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截帧失败", {
        id: toastId,
      });
    } finally {
      setCapturing(false);
    }
  }

  const storedView =
    node.data.lastView &&
    typeof node.data.lastView === "object" &&
    !Array.isArray(node.data.lastView)
      ? (node.data.lastView as {
          yaw?: number;
          pitch?: number;
          fov?: number;
        })
      : undefined;

  return (
    <>
      <div
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(e) => {
          if (!framed) return;
          e.stopPropagation();
          setImmersive(true);
        }}
        className={cn(
          "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
          nodeChromeClass({ selected, highlighted, pulsing, framed }),
        )}
        style={{
          left: node.x,
          top: node.y,
          width: node.width ?? 340,
          height: node.height ?? 170,
        }}
      >
        <NodeTitleChip
          nodeId={node.id}
          label={nodeTitleLabel("panorama", node.data)}
          customTitle={String(node.data.title ?? "")}
          visible={framed || busy || selected || hovered}
          icon={<CanvasIconPanorama />}
          onDragPointerDown={onPointerDown}
        />
        <div
          className={cn(
            "relative h-full w-full overflow-hidden rounded-md",
            framed && "bg-black",
          )}
        >          {framed ? (
            showNodeViewer ? (
              <PanoramaViewer
                url={url}
                active
                orbit={selected}
                initialView={storedView}
                onReady={onReady}
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none max-h-full max-w-full select-none object-contain opacity-80"
                  onDragStart={(event) => event.preventDefault()}
                />
              </div>
            )
          ) : busy ? (
            <MediaBusyState
              label={mediaBusyLabel(node.data)}
              onCancel={onCancel}
            />
          ) : (
            <MediaUploadLabel nodeId={node.id} kind="panorama">
              <CanvasIconPanorama />
            </MediaUploadLabel>
          )}
          {framed && busy ? (
            <MediaBusyState
              overlay
              label={mediaBusyLabel(node.data)}
              onCancel={onCancel}
            />
          ) : null}
          {framed && String(node.data.aspectHint ?? "") === "non-2:1" ? (
            <div className="pointer-events-none absolute left-2 top-2 rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] text-black">
              建议 2:1 全景图
            </div>
          ) : null}
          {framed ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2">
              <div className="pointer-events-auto flex gap-1">
                <button
                  type="button"
                  className="rounded-md bg-black/55 px-2 py-1 text-[11px] text-white hover:bg-black/70 disabled:opacity-40"
                  title="截取当前视角"
                  disabled={capturing || !showNodeViewer}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => void captureView()}
                >
                  <CanvasIconCamera className="mr-1 inline size-3" />
                  截帧
                </button>
                <button
                  type="button"
                  className="rounded-md bg-black/55 px-2 py-1 text-[11px] text-white hover:bg-black/70 disabled:opacity-40"
                  title="重置视角"
                  disabled={!showNodeViewer}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => apiRef.current?.resetView()}
                >
                  <CanvasIconRetry className="mr-1 inline size-3" />
                  复位
                </button>
              </div>
              <button
                type="button"
                className="pointer-events-auto rounded-md bg-black/55 px-2 py-1 text-[11px] text-white hover:bg-black/70"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setImmersive(true)}
              >
                <CanvasIconMaximize className="mr-1 inline size-3" />
                环视
              </button>
            </div>
          ) : null}
          <NodeRuntimeBadge
            status={busy ? "idle" : status}
            error={error}
            busyLabel={mediaBusyLabel(node.data)}
            onRetry={
              status === "failed"
                ? () =>
                    updateNodeData(node.id, {
                      status: "idle",
                      error: "",
                      jobId: "",
                      busyLabel: "",
                    })
                : undefined
            }
          />
        </div>
      </div>

      {immersive && framed && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex flex-col bg-black"
              data-canvas-shortcuts-ignore
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-white">
                <span>全景环视 · 拖动查看 · 滚轮缩放 · Esc 关闭</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10 disabled:opacity-40"
                    disabled={capturing}
                    onClick={() => void captureView()}
                  >
                    <CanvasIconCamera className="size-3.5" />
                    {capturing ? "截取中…" : "截取当前视角"}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/10"
                    onClick={() => apiRef.current?.resetView()}
                  >
                    <CanvasIconRetry className="size-3.5" />
                    复位
                  </button>
                  <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md hover:bg-white/10"
                    aria-label="关闭"
                    onClick={closeImmersive}
                  >
                    <CanvasIconClose className="size-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <PanoramaViewer
                  url={url}
                  active
                  initialView={storedView}
                  onReady={onReady}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
