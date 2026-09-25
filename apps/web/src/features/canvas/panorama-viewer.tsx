"use client";

import { useEffect, useRef, useState } from "react";
import { SYSTEM, Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";
import { cn } from "@/shared/lib/utils";
import { fetchRemoteImageBlob } from "./lib/load-canvas-image";

export type PanoramaView = {
  yaw: number;
  pitch: number;
  fov: number;
};

export type PanoramaViewerApi = {
  canvas: () => HTMLCanvasElement | null;
  /** Force a paint, wait a frame, then return the WebGL canvas. */
  captureCanvas: () => Promise<HTMLCanvasElement | null>;
  getView: () => PanoramaView;
  setView: (view: Partial<PanoramaView>) => void;
  resetView: () => void;
};

type Props = {
  url: string;
  className?: string;
  /** When false, tear down WebGL (keep only a few live on the board). */
  active?: boolean;
  initialView?: Partial<PanoramaView>;
  /** Inline previews pass false so the node can still be dragged. */
  orbit?: boolean;
  onReady?: (api: PanoramaViewerApi) => void;
  onViewChange?: (view: PanoramaView) => void;
};

/** Match Photo Sphere Viewer defaultZoomLvl 50 with minFov 25 / maxFov 110. */
const MIN_FOV = 25;
const MAX_FOV = 110;
const DEFAULT_VIEW: PanoramaView = { yaw: 0, pitch: 0, fov: 67.5 };

function clampFov(fov: number) {
  return Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
}

function clampPitch(pitch: number) {
  return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
}

function waitFrames(count = 2) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
}

/**
 * Equirectangular panorama via @photo-sphere-viewer/core.
 * Keeps FrameRally capture / lastView API on top of the plugin.
 */
export function PanoramaViewer({
  url,
  className,
  active = true,
  initialView,
  orbit = true,
  onReady,
  onViewChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const orbitRef = useRef(orbit);
  const onReadyRef = useRef(onReady);
  const onViewChangeRef = useRef(onViewChange);
  orbitRef.current = orbit;
  onReadyRef.current = onReady;
  onViewChangeRef.current = onViewChange;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url || !active) return;

    setStatus("loading");
    let cancelled = false;
    let objectUrl = "";
    let viewer: Viewer | null = null;

    const seed: PanoramaView = {
      yaw: initialView?.yaw ?? DEFAULT_VIEW.yaw,
      pitch: clampPitch(initialView?.pitch ?? DEFAULT_VIEW.pitch),
      fov: clampFov(initialView?.fov ?? DEFAULT_VIEW.fov),
    };

    const readView = (): PanoramaView => {
      if (!viewer) return { ...seed };
      const pos = viewer.getPosition();
      return {
        yaw: pos.yaw,
        pitch: clampPitch(pos.pitch),
        fov: clampFov(viewer.dataHelper.zoomLevelToFov(viewer.getZoomLevel())),
      };
    };

    const emitView = () => {
      onViewChangeRef.current?.(readView());
    };

    const pickCanvas = () =>
      viewer?.container.querySelector<HTMLCanvasElement>(".psv-canvas") ?? null;

    const onReadyEvt = () => {
      if (cancelled) return;
      setStatus("ready");
    };
    const onErrorEvt = () => {
      if (cancelled) return;
      setStatus("error");
    };
    const onPosition = () => emitView();
    const onZoom = () => emitView();

    const destroyViewer = () => {
      if (!viewer) return;
      const current = viewer;
      viewer = null;
      viewerRef.current = null;
      current.removeEventListener("ready", onReadyEvt);
      current.removeEventListener("panorama-error", onErrorEvt);
      current.removeEventListener("position-updated", onPosition);
      current.removeEventListener("zoom-updated", onZoom);
      const canvas = current.container.querySelector<HTMLCanvasElement>(".psv-canvas");
      const lose = canvas
        ?.getContext("webgl2")
        ?.getExtension("WEBGL_lose_context");
      try {
        current.destroy();
      } finally {
        lose?.loseContext();
      }
    };

    const mount = (panoramaSrc: string) => {
      if (cancelled || !host) return;
      try {
        SYSTEM.load();
        const zoomLvl = Math.round(
          ((MAX_FOV - seed.fov) / (MAX_FOV - MIN_FOV)) * 100,
        );
        const canOrbit = orbitRef.current;
        viewer = new Viewer({
          container: host,
          panorama: panoramaSrc,
          navbar: false,
          loadingTxt: "",
          canvasBackground: "#0a0a0c",
          mousewheel: canOrbit,
          mousemove: canOrbit,
          touchmoveTwoFingers: false,
          moveInertia: false,
          defaultZoomLvl: Math.max(0, Math.min(100, zoomLvl)),
          defaultYaw: seed.yaw,
          defaultPitch: seed.pitch,
          minFov: MIN_FOV,
          maxFov: MAX_FOV,
          rendererParameters: {
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true,
          },
        });
        viewerRef.current = viewer;
        viewer.addEventListener("ready", onReadyEvt);
        viewer.addEventListener("panorama-error", onErrorEvt);
        viewer.addEventListener("position-updated", onPosition);
        viewer.addEventListener("zoom-updated", onZoom);

        const api: PanoramaViewerApi = {
          canvas: () => {
            if (!viewer) return null;
            viewer.needsUpdate();
            return pickCanvas();
          },
          captureCanvas: async () => {
            if (!viewer) return null;
            viewer.needsUpdate();
            await waitFrames(2);
            if (!viewer) return null;
            viewer.needsUpdate();
            await waitFrames(1);
            return pickCanvas();
          },
          getView: () => readView(),
          setView: (next) => {
            if (!viewer) return;
            const current = readView();
            const yaw = typeof next.yaw === "number" ? next.yaw : current.yaw;
            const pitch =
              typeof next.pitch === "number"
                ? clampPitch(next.pitch)
                : current.pitch;
            const fov =
              typeof next.fov === "number" ? clampFov(next.fov) : current.fov;
            viewer.rotate({ yaw, pitch });
            viewer.zoom(viewer.dataHelper.fovToZoomLevel(fov));
            emitView();
          },
          resetView: () => {
            if (!viewer) return;
            viewer.rotate({
              yaw: DEFAULT_VIEW.yaw,
              pitch: DEFAULT_VIEW.pitch,
            });
            viewer.zoom(viewer.dataHelper.fovToZoomLevel(DEFAULT_VIEW.fov));
            emitView();
          },
        };
        onReadyRef.current?.(api);
      } catch {
        if (!cancelled) setStatus("error");
        destroyViewer();
        host.replaceChildren();
      }
    };

    if (/^https?:/i.test(url)) {
      void fetchRemoteImageBlob(url)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          mount(objectUrl);
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    } else {
      mount(url);
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      destroyViewer();
      host.replaceChildren();
    };
    // initialView only seeds the first mount; orbit toggles via setOptions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, active]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    try {
      viewer.setOptions({
        mousemove: orbit,
        mousewheel: orbit,
      });
    } catch {
      /* viewer may be disposing */
    }
  }, [orbit]);

  if (!active) {
    return (
      <div
        className={cn(
          "grid h-full w-full place-items-center bg-black/80",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden",
        orbit
          ? "cursor-grab touch-none active:cursor-grabbing"
          : "pointer-events-none",
        className,
      )}
      data-canvas-no-zoom={orbit ? true : undefined}
      onPointerDown={orbit ? (event) => event.stopPropagation() : undefined}
      onWheel={orbit ? (event) => event.stopPropagation() : undefined}
    >
      <div ref={hostRef} className="absolute inset-0 joy-psv-host" />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/35 text-[11px] text-white/80">
          正在加载全景…
        </div>
      ) : null}
      {status === "error" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[11px] text-white/80">
          全景图加载失败
        </div>
      ) : null}
    </div>
  );
}

export async function canvasToPngFile(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("截图失败"))),
      "image/png",
    );
  });
  return new File([blob], name, { type: "image/png" });
}
