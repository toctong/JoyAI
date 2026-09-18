"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/shared/lib/utils";
import { fetchRemoteImageBlob } from "./lib/load-canvas-image";

export type PanoramaView = {
  yaw: number;
  pitch: number;
  fov: number;
};

export type PanoramaViewerApi = {
  canvas: () => HTMLCanvasElement | null;
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

const DEFAULT_VIEW: PanoramaView = { yaw: 0, pitch: 0, fov: 75 };

/**
 * Equirectangular panorama via three.js (sphere + Orbit-style look).
 * Not a hand-rolled WebGL shader stack.
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
  const onReadyRef = useRef(onReady);
  const onViewChangeRef = useRef(onViewChange);
  onReadyRef.current = onReady;
  onViewChangeRef.current = onViewChange;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url || !active) return;

    setStatus("loading");

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0a0a0c, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = orbit ? "none" : "auto";
    renderer.domElement.style.pointerEvents = orbit ? "auto" : "none";
    renderer.domElement.style.opacity = "0";
    renderer.domElement.style.transition = "opacity 160ms ease";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 2000);
    const view: PanoramaView = {
      yaw: initialView?.yaw ?? DEFAULT_VIEW.yaw,
      pitch: initialView?.pitch ?? DEFAULT_VIEW.pitch,
      fov: initialView?.fov ?? DEFAULT_VIEW.fov,
    };

    const geometry = new THREE.SphereGeometry(500, 64, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x1a1a1e });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const applyCamera = () => {
      camera.fov = view.fov;
      camera.updateProjectionMatrix();
      camera.rotation.order = "YXZ";
      camera.rotation.y = view.yaw;
      camera.rotation.x = view.pitch;
      camera.position.set(0, 0, 0);
    };
    applyCamera();

    const resize = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let cancelled = false;
    let objectUrl = "";
    const loader = new THREE.TextureLoader();
    const applyTexture = (textureUrl: string) => {
      loader.load(
        textureUrl,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          renderer.domElement.style.opacity = "1";
          setStatus("ready");
        },
        undefined,
        () => {
          if (!cancelled) setStatus("error");
        },
      );
    };
    if (/^https?:/i.test(url)) {
      void fetchRemoteImageBlob(url)
        .then((blob) => {
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          applyTexture(objectUrl);
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    } else {
      applyTexture(url);
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const canvas = renderer.domElement;

    const emitView = () => onViewChangeRef.current?.({ ...view });

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      view.yaw -= dx * 0.005;
      view.pitch = Math.max(
        -1.2,
        Math.min(1.2, view.pitch + dy * 0.005),
      );
      applyCamera();
      emitView();
    };
    const onPointerUp = () => {
      dragging = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const next = view.fov + event.deltaY * 0.05;
      view.fov = Math.max(35, Math.min(110, next));
      applyCamera();
      emitView();
    };

    if (orbit) {
      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
    }

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      renderer.render(scene, camera);
    };
    loop();

    const api: PanoramaViewerApi = {
      canvas: () => {
        renderer.render(scene, camera);
        return renderer.domElement;
      },
      getView: () => ({ ...view }),
      setView: (next) => {
        if (typeof next.yaw === "number") view.yaw = next.yaw;
        if (typeof next.pitch === "number") {
          view.pitch = Math.max(-1.2, Math.min(1.2, next.pitch));
        }
        if (typeof next.fov === "number") {
          view.fov = Math.max(35, Math.min(110, next.fov));
        }
        applyCamera();
        emitView();
      },
      resetView: () => {
        view.yaw = DEFAULT_VIEW.yaw;
        view.pitch = DEFAULT_VIEW.pitch;
        view.fov = DEFAULT_VIEW.fov;
        applyCamera();
        emitView();
      },
    };
    onReadyRef.current?.(api);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      cancelAnimationFrame(frame);
      ro.disconnect();
      if (orbit) {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        canvas.removeEventListener("wheel", onWheel);
      }
      material.map?.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
    // initialView only seeds the first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, active, orbit]);

  if (!active) {
    return (
      <div
        className={cn("grid h-full w-full place-items-center bg-black/80", className)}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={cn(
        "relative h-full w-full touch-none",
        orbit
          ? "cursor-grab active:cursor-grabbing"
          : "pointer-events-none",
        className,
      )}
      data-canvas-no-zoom={orbit ? true : undefined}
      onPointerDown={orbit ? (event) => event.stopPropagation() : undefined}
    >
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
