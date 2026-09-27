"use client";

import {
  CanvasIconCamera,
  CanvasIconImage,
  CanvasIconPanorama,
} from "../icons/canvas-icons";
import { useCallback, useEffect, useRef, useState } from "react";
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
  DEFAULT_VIEW,
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

function formatViewLabel(view: PanoramaView) {
  const yaw = Math.round((view.yaw * 180) / Math.PI);
  const pitch = Math.round((view.pitch * 180) / Math.PI);
  const zoom =
    view.fov > 0 ? Math.max(0.1, DEFAULT_VIEW.fov / view.fov) : 1;
  return `横 ${yaw}° · 纵 ${pitch}° · 缩放 ${zoom.toFixed(1)}x`;
}

const overlayPill =
  "inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm";

export function PanoramaNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const addEdge = useCanvasStore((s) => s.addEdge);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const previewing = Boolean(node.data.panoramaPreview);
  const autorotate = Boolean(node.data.panoramaAutorotate);
  const [hovered, setHovered] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [liveView, setLiveView] = useState<PanoramaView | null>(null);
  const apiRef = useRef<PanoramaViewerApi | null>(null);

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

  useEffect(() => {
    if (previewing) return;
    setLiveView(null);
    apiRef.current = null;
    if (autorotate) {
      updateNodeData(node.id, { panoramaAutorotate: false });
    }
  }, [previewing, autorotate, node.id, updateNodeData]);

  useEffect(() => {
    if (!previewing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        exitPreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing]);

  const persistView = useCallback(
    (view?: PanoramaView) => {
      const next = view ?? apiRef.current?.getView();
      if (!next) return;
      updateNodeData(node.id, { lastView: next });
    },
    [node.id, updateNodeData],
  );

  function exitPreview() {
    persistView();
    updateNodeData(node.id, {
      panoramaPreview: false,
      panoramaAutorotate: false,
    });
  }

  const onReady = useCallback((api: PanoramaViewerApi) => {
    apiRef.current = api;
    setLiveView(api.getView());
  }, []);

  const onViewChange = useCallback((view: PanoramaView) => {
    setLiveView(view);
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
      const view = api.getView();
      updateNodeData(node.id, { lastView: view });
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

  function enterPreview(event?: React.SyntheticEvent) {
    event?.stopPropagation();
    if (!framed) return;
    updateNodeData(node.id, { panoramaPreview: true });
  }

  const viewLabel = formatViewLabel(
    liveView ?? {
      yaw: storedView?.yaw ?? DEFAULT_VIEW.yaw,
      pitch: storedView?.pitch ?? DEFAULT_VIEW.pitch,
      fov: storedView?.fov ?? DEFAULT_VIEW.fov,
    },
  );

  return (
    <div
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-panorama-controls]")) {
          event.stopPropagation();
          return;
        }
        onPointerDown(event);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={(e) => {
        if (!framed || previewing) return;
        e.stopPropagation();
        updateNodeData(node.id, { panoramaPreview: true });
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
      >
        {framed ? (
          previewing ? (
            <PanoramaViewer
              url={url}
              active
              orbit
              autorotate={autorotate}
              initialView={storedView}
              onReady={onReady}
              onViewChange={onViewChange}
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                draggable={false}
                className="pointer-events-none max-h-full max-w-full select-none object-contain"
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

        {framed ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2">
              <div className="flex flex-col gap-1">
                <span className={cn(overlayPill, "w-fit rounded-full px-2 py-1 text-[11px]")}>
                  <CanvasIconPanorama className="size-3 opacity-90" />
                  720° 环视
                </span>
                {!previewing &&
                String(node.data.aspectHint ?? "") === "non-2:1" ? (
                  <span className="w-fit rounded bg-amber-500/90 px-1.5 py-0.5 text-[10px] text-black">
                    建议 2:1 环视图
                  </span>
                ) : null}
              </div>
              <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
                {previewing ? (
                  <>
                    <button
                      type="button"
                      data-panorama-controls
                      data-canvas-no-zoom
                      title="截取当前视角"
                      disabled={capturing}
                      className={cn(
                        overlayPill,
                        "hover:bg-black/70 disabled:opacity-40",
                      )}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void captureView();
                      }}
                    >
                      <CanvasIconCamera className="size-3.5" />
                      {capturing ? "截取中…" : "截帧"}
                    </button>
                    <button
                      type="button"
                      data-panorama-controls
                      data-canvas-no-zoom
                      title="退出预览"
                      className={cn(overlayPill, "hover:bg-black/70")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        exitPreview();
                      }}
                    >
                      <CanvasIconImage className="size-3.5" />
                      退出预览
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    data-panorama-controls
                    data-canvas-no-zoom
                    title="进入全景预览"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={enterPreview}
                  >
                    <CanvasIconPanorama className="size-3.5" />
                    进入全景预览
                  </button>
                )}
              </div>
            </div>
            {previewing ? (
              <div className="pointer-events-none absolute bottom-2 right-2 z-10">
                <span className={cn(overlayPill, "tabular-nums text-[11px]")}>
                  {viewLabel}
                </span>
              </div>
            ) : null}
          </>
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
  );
}
