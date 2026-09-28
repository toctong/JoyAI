"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CanvasIconCamera,
  CanvasIconImage,
  CanvasIconPanorama,
} from "@/features/canvas/icons/canvas-icons";
import {
  DEFAULT_VIEW,
  PanoramaViewer,
  type PanoramaViewerApi,
  type PanoramaView,
} from "@/features/canvas/panorama-viewer";
import { captureStudioPanoramaView } from "@/features/studio/studio-asset-actions";
import { toast } from "@/shared/lib/toast";
import { cn } from "@/shared/lib/utils";

type Props = {
  open: boolean;
  url: string;
  onClose: () => void;
  /** Called after a view still is registered in the studio feed. */
  onCaptured?: (jobId: string) => void | Promise<void>;
};

const overlayPill =
  "inline-flex items-center gap-1.5 rounded-lg bg-black/55 px-2.5 py-1.5 text-[12px] font-medium text-white backdrop-blur-sm";

function formatViewLabel(view: PanoramaView) {
  const yaw = Math.round((view.yaw * 180) / Math.PI);
  const pitch = Math.round((view.pitch * 180) / Math.PI);
  const zoom =
    view.fov > 0 ? Math.max(0.1, DEFAULT_VIEW.fov / view.fov) : 1;
  return `横 ${yaw}° · 纵 ${pitch}° · 缩放 ${zoom.toFixed(1)}x`;
}

/**
 * Studio feed 720° sphere preview — same Photo Sphere stack as canvas
 * panorama nodes, without leaving `/studio`.
 */
export function StudioPanoramaPreview({
  open,
  url,
  onClose,
  onCaptured,
}: Props) {
  const apiRef = useRef<PanoramaViewerApi | null>(null);
  const [autorotate, setAutorotate] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [liveView, setLiveView] = useState<PanoramaView | null>(null);

  useEffect(() => {
    if (!open) {
      setAutorotate(false);
      setCapturing(false);
      setLiveView(null);
      apiRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
      const created = await captureStudioPanoramaView(canvas);
      await onCaptured?.(created.id);
      toast.success("已截取当前视角到创作流", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "截帧失败", {
        id: toastId,
      });
    } finally {
      setCapturing(false);
    }
  }

  const viewLabel = formatViewLabel(liveView ?? DEFAULT_VIEW);

  return (
    <Dialog
      open={open && Boolean(url)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "fixed inset-0 left-0 top-0 z-50 flex h-dvh max-h-dvh w-screen max-w-none",
          "translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0",
          "bg-black p-0 shadow-none sm:max-w-none",
          /* Hide default Dialog X — we render an explicit exit control. */
          "[&>button.absolute]:hidden",
        )}
      >
        <DialogTitle className="sr-only">720° 全景预览</DialogTitle>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
          <span
            className={cn(
              overlayPill,
              "pointer-events-none w-fit rounded-full px-2.5 py-1 text-[11px]",
            )}
          >
            <CanvasIconPanorama className="size-3.5 opacity-90" />
            720° 环视 · 拖拽旋转 · 滚轮缩放
          </span>
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              title="截取当前视角"
              disabled={capturing}
              className={cn(overlayPill, "hover:bg-black/70 disabled:opacity-40")}
              onClick={() => void captureView()}
            >
              <CanvasIconCamera className="size-3.5" />
              {capturing ? "截取中…" : "截帧"}
            </button>
            <button
              type="button"
              title={autorotate ? "停止自动旋转" : "自动旋转"}
              className={cn(overlayPill, "hover:bg-black/70")}
              onClick={() => setAutorotate((v) => !v)}
            >
              <RotateCw
                className={cn(
                  "size-3.5",
                  autorotate && "animate-spin text-primary",
                )}
                style={autorotate ? { animationDuration: "2.4s" } : undefined}
              />
              {autorotate ? "旋转中" : "自动旋转"}
            </button>
            <button
              type="button"
              title="重置视角"
              className={cn(overlayPill, "hover:bg-black/70")}
              onClick={() => apiRef.current?.resetView()}
            >
              <CanvasIconImage className="size-3.5" />
              重置
            </button>
            <button
              type="button"
              className={cn(overlayPill, "hover:bg-black/70")}
              onClick={onClose}
            >
              <X className="size-3.5" />
              退出预览
            </button>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 z-10">
          <span className={cn(overlayPill, "tabular-nums text-[11px]")}>
            {viewLabel}
          </span>
        </div>
        <div className="min-h-0 flex-1">
          {open && url ? (
            <PanoramaViewer
              url={url}
              active
              orbit
              autorotate={autorotate}
              className="size-full"
              onReady={onReady}
              onViewChange={onViewChange}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
