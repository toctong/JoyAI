"use client";

/**
 * Interactive Three.js lighting gizmo — tight lat/long sphere,
 * soft billboard light on the sphere (no long beam), weak floor.
 * Remote images via `/media/fetch` (TOS has no WebGL CORS).
 */

import { useEffect, useRef, useState } from "react";
import { fetchRemoteImageBlob } from "./load-canvas-image";
import {
  LIGHTING_SPHERE_RADIUS,
  lightingAnglesFromPoint,
  lightingPosition,
  type LightingParams,
} from "./lighting-prompt";

type ViewMode = "original" | "preview" | "front";

type Props = {
  url: string;
  params: LightingParams;
  mode: ViewMode;
  className?: string;
  onParamsChange?: (patch: Partial<LightingParams>) => void;
  onReset?: () => void;
};

async function loadTextureFromUrl(
  THREE: typeof import("three"),
  src: string,
): Promise<{
  texture: InstanceType<typeof THREE.Texture>;
  objectUrl: string;
}> {
  let objectUrl = "";
  let imgSrc = src;
  if (/^https?:\/\//i.test(src)) {
    const blob = await fetchRemoteImageBlob(src);
    objectUrl = URL.createObjectURL(blob);
    imgSrc = objectUrl;
  }

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = imgSrc;
  });

  const texture = new THREE.Texture(img);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, objectUrl };
}

/** Soft white disc for the key-light handle (billboard). */
function makeLightSpriteTexture(THREE: typeof import("three")) {
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return new THREE.Texture();
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.28, "rgba(255,255,255,0.95)");
  g.addColorStop(0.55, "rgba(255,248,220,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

/** Globe wire: meridians + parallels (cleaner than WireframeGeometry). */
function buildGlobeLines(
  THREE: typeof import("three"),
  radius: number,
) {
  const positions: number[] = [];
  const meridians = 16;
  const parallels = 10;
  const segs = 64;

  for (let m = 0; m < meridians; m++) {
    const az = (m / meridians) * Math.PI * 2;
    for (let i = 0; i < segs; i++) {
      const t0 = -Math.PI / 2 + (i / segs) * Math.PI;
      const t1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI;
      const push = (t: number) => {
        positions.push(
          Math.cos(az) * Math.cos(t) * radius,
          Math.sin(t) * radius,
          Math.sin(az) * Math.cos(t) * radius,
        );
      };
      push(t0);
      push(t1);
    }
  }

  for (let p = 1; p < parallels; p++) {
    const el = -Math.PI / 2 + (p / parallels) * Math.PI;
    const r = Math.cos(el) * radius;
    const y = Math.sin(el) * radius;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      positions.push(Math.cos(a0) * r, y, Math.sin(a0) * r);
      positions.push(Math.cos(a1) * r, y, Math.sin(a1) * r);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: true,
    }),
  );
}

export function LightingThreePreview({
  url,
  params,
  mode,
  className,
  onParamsChange,
  onReset,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const paramsRef = useRef(params);
  const modeRef = useRef(mode);
  const onParamsChangeRef = useRef(onParamsChange);
  const onResetRef = useRef(onReset);
  paramsRef.current = params;
  modeRef.current = mode;
  onParamsChangeRef.current = onParamsChange;
  onResetRef.current = onReset;

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  const apiRef = useRef<{
    setParams: (p: LightingParams) => void;
    setMode: (m: ViewMode) => void;
    dispose: () => void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !url) return;
    let disposed = false;
    setStatus("loading");

    void (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import(
        "three/addons/controls/OrbitControls.js"
      );
      if (disposed || !hostRef.current) return;

      let texture: InstanceType<typeof THREE.Texture>;
      let objectUrl = "";
      try {
        const loaded = await loadTextureFromUrl(THREE, url);
        texture = loaded.texture;
        objectUrl = loaded.objectUrl;
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      if (disposed) {
        texture.dispose();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return;
      }

      const width = Math.max(320, host.clientWidth || 640);
      const height = Math.max(280, host.clientHeight || 420);
      const radius = LIGHTING_SPHERE_RADIUS;

      /** Distance so the full sphere (+margin for HUD) fits in the viewport. */
      function computeFitDistance(aspect: number, fovDeg: number) {
        const halfV = Math.tan(((fovDeg / 2) * Math.PI) / 180);
        const halfH = halfV * Math.max(0.35, aspect);
        const distV = radius / halfV;
        const distH = radius / halfH;
        return Math.max(distV, distH) * 1.28;
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x101012);

      const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 80);
      let viewDist = computeFitDistance(camera.aspect, camera.fov);
      // Start in mild tabletop view — upright card, not sideways
      camera.position.set(viewDist * 0.025, viewDist * 0.13, viewDist);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.replaceChildren(renderer.domElement);
      const canvas = renderer.domElement;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.display = "block";
      canvas.style.borderRadius = "12px";
      canvas.style.touchAction = "none";
      canvas.style.cursor = "crosshair";

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = viewDist * 0.9;
      controls.maxDistance = viewDist * 1.6;
      controls.target.set(0, 0, 0);
      controls.mouseButtons = {
        LEFT: -1 as unknown as typeof THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.touches = {
        ONE: -1 as unknown as typeof THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };

      const ambient = new THREE.AmbientLight(0xffffff, 0.48);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xfff2d6, 1.5);
      key.position.set(0, 0.8, 1.4);
      scene.add(key);
      scene.add(key.target);

      const fill = new THREE.DirectionalLight(0xb8d4ff, 0.28);
      fill.position.set(-1.1, 0.15, 0.9);
      scene.add(fill);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0);
      rimLight.position.set(0, 0.35, -1.4);
      scene.add(rimLight);

      const globe = buildGlobeLines(THREE, radius);
      scene.add(globe);

      // Soft equator emphasis
      const equator = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 97 }, (_, i) => {
            const t = (i / 96) * Math.PI * 2;
            return new THREE.Vector3(
              Math.cos(t) * radius,
              0,
              Math.sin(t) * radius,
            );
          }),
        ),
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      );
      scene.add(equator);

      const hitSphere = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 40, 28),
        new THREE.MeshBasicMaterial({
          visible: false,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      scene.add(hitSphere);

      const spriteMap = makeLightSpriteTexture(THREE);
      const lightSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: spriteMap,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      lightSprite.scale.set(0.36, 0.36, 1);
      lightSprite.renderOrder = 5;
      scene.add(lightSprite);

      // Subtle floor — don't steal focus from the globe
      const grid = new THREE.GridHelper(3.0, 10, 0x222228, 0x18181c);
      grid.position.y = -radius - 0.01;
      const gridMats = Array.isArray(grid.material)
        ? grid.material
        : [grid.material];
      for (const mat of gridMats) {
        const m = mat as InstanceType<typeof THREE.Material> & {
          opacity?: number;
          transparent?: boolean;
        };
        m.transparent = true;
        m.opacity = 0.35;
      }
      scene.add(grid);

      const imgEl = texture.image as HTMLImageElement;
      const iw = imgEl.naturalWidth || imgEl.width || 1;
      const ih = imgEl.naturalHeight || imgEl.height || 1;
      const aspect = iw / Math.max(1, ih);
      // Keep the photo strictly inside the sphere (like the reference UI)
      const maxHalfDiag = radius * 0.78;
      let planeH = maxHalfDiag * 1.15;
      let planeW = planeH * aspect;
      const halfDiag = Math.hypot(planeW / 2, planeH / 2);
      if (halfDiag > maxHalfDiag) {
        const s = maxHalfDiag / halfDiag;
        planeW *= s;
        planeH *= s;
      }

      const planeMat = new THREE.MeshStandardMaterial({
        map: texture,
        // Keep photo solid/readable — without emissive, low ambient looks "transparent"
        emissiveMap: texture,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0.72,
        roughness: 0.88,
        metalness: 0,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        side: THREE.FrontSide,
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(planeW, planeH),
        planeMat,
      );
      // Upright card facing +Z; nudge toward camera so sphere wires don't ghost through
      plane.rotation.set(0, 0, 0);
      plane.position.set(0, 0, 0.05);
      plane.renderOrder = 2;
      scene.add(plane);

      // Also raycast the photo so "点哪光到哪" feels on-image
      const hitPlane = plane;

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let dragging = false;
      let raf = 0;

      function applyCamera(m: ViewMode) {
        controls.enabled = m === "preview";
        if (m === "original") {
          // Flat on-screen view of the photo
          camera.position.set(0, 0, viewDist);
          controls.target.set(0, 0, 0);
          controls.update();
        } else if (m === "front") {
          // Orthographic-feeling front — still upright, no side yaw
          camera.position.set(0, 0, viewDist);
          controls.target.set(0, 0, 0);
          controls.update();
        } else {
          // 透视：略抬高、几乎不侧移 —— 画板正立，只有轻微景深透视
          camera.position.set(
            viewDist * 0.025,
            viewDist * 0.13,
            viewDist,
          );
          controls.target.set(0, -radius * 0.04, 0);
          controls.update();
        }
      }

      function applyParams(p: LightingParams) {
        const pos = lightingPosition(p.azimuth, p.elevation, radius);
        key.position.set(pos.x, pos.y, pos.z);
        key.target.position.set(0, 0, 0);
        key.target.updateMatrixWorld();

        // Pull the handle slightly toward the photo so frontal lights sit
        // on/near the image like the reference (not a far outer bulb).
        const frontness = Math.max(0, Math.cos((p.azimuth * Math.PI) / 180));
        const pull = 0.18 + frontness * 0.22;
        lightSprite.position.set(
          pos.x * (1 - pull * 0.35),
          pos.y * (1 - pull * 0.25),
          pos.z * (1 - pull * 0.45) + pull * 0.08,
        );
        // Normalize back onto a slightly smaller shell so it stays on-globe
        const len = lightSprite.position.length() || 1;
        lightSprite.position.multiplyScalar((radius * 0.98) / len);

        const warm = p.temperature < 4500;
        const cool = p.temperature > 6500;
        const color = warm ? 0xffc98a : cool ? 0xd8e7ff : 0xffffff;
        key.color.set(color);
        lightSprite.material.color.set(color);

        const m = modeRef.current;
        if (m === "original") {
          key.intensity = 0;
          ambient.intensity = 0.35;
          fill.intensity = 0;
          rimLight.intensity = 0;
          planeMat.emissiveIntensity = 1;
        } else {
          ambient.intensity = 0.28 + (1 - p.brightness / 100) * 0.08;
          key.intensity = 0.55 + (p.brightness / 100) * 1.1;
          fill.intensity = 0.18;
          rimLight.intensity = p.rim ? 0.85 : 0;
          // Solid base + light response (never wash to see-through)
          planeMat.emissiveIntensity = 0.62;
        }

        const showGizmo = m === "preview";
        globe.visible = showGizmo;
        equator.visible = showGizmo;
        lightSprite.visible = showGizmo;
        grid.visible = m === "preview";
      }

      function setPointerFromEvent(event: PointerEvent) {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }

      function placeLightFromEvent(event: PointerEvent) {
        setPointerFromEvent(event);
        raycaster.setFromCamera(pointer, camera);

        // Prefer photo hit → project from origin through point onto sphere
        const planeHits = raycaster.intersectObject(hitPlane, false);
        if (planeHits[0]) {
          const p = planeHits[0].point;
          onParamsChangeRef.current?.(
            lightingAnglesFromPoint(p.x, p.y, Math.max(0.08, p.z + 0.35)),
          );
          return;
        }

        const hits = raycaster.intersectObject(hitSphere, false);
        if (hits[0]) {
          const p = hits[0].point;
          onParamsChangeRef.current?.(
            lightingAnglesFromPoint(p.x, p.y, p.z),
          );
          return;
        }

        const dir = raycaster.ray.direction.clone().normalize();
        const origin = raycaster.ray.origin.clone();
        const oc = origin.clone();
        const a = dir.dot(dir);
        const b = 2 * oc.dot(dir);
        const c = oc.dot(oc) - radius * radius;
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const t = (-b + Math.sqrt(disc)) / (2 * a);
          const p = origin.clone().add(dir.multiplyScalar(t));
          onParamsChangeRef.current?.(
            lightingAnglesFromPoint(p.x, p.y, p.z),
          );
          return;
        }
        onParamsChangeRef.current?.({
          azimuth: Math.abs(paramsRef.current.azimuth) >= 90 ? 180 : -180,
          elevation: Math.max(-90, Math.min(90, Math.round(pointer.y * 70))),
        });
      }

      const onPointerDown = (event: PointerEvent) => {
        if (modeRef.current !== "preview") return;
        if (event.button !== 0) return;
        dragging = true;
        controls.enabled = false;
        canvas.setPointerCapture(event.pointerId);
        placeLightFromEvent(event);
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        placeLightFromEvent(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        try {
          canvas.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        controls.enabled = modeRef.current === "preview";
      };
      const onDblClick = (event: MouseEvent) => {
        if (modeRef.current !== "preview") return;
        event.preventDefault();
        onResetRef.current?.();
      };
      const onContextMenu = (event: Event) => event.preventDefault();

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerUp);
      canvas.addEventListener("dblclick", onDblClick);
      canvas.addEventListener("contextmenu", onContextMenu);

      applyCamera(modeRef.current);
      applyParams(paramsRef.current);

      const onResize = () => {
        if (!hostRef.current) return;
        const w = Math.max(320, hostRef.current.clientWidth);
        const h = Math.max(280, hostRef.current.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        viewDist = computeFitDistance(camera.aspect, camera.fov);
        controls.minDistance = viewDist * 0.9;
        controls.maxDistance = viewDist * 1.6;
        applyCamera(modeRef.current);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(host);
      requestAnimationFrame(onResize);

      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        if (controls.enabled) controls.update();
        renderer.render(scene, camera);
      };
      tick();
      setStatus("ready");

      apiRef.current = {
        setParams: (p) => applyParams(p),
        setMode: (m) => {
          modeRef.current = m;
          applyCamera(m);
          applyParams(paramsRef.current);
        },
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onPointerDown);
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerup", onPointerUp);
          canvas.removeEventListener("pointercancel", onPointerUp);
          canvas.removeEventListener("dblclick", onDblClick);
          canvas.removeEventListener("contextmenu", onContextMenu);
          controls.dispose();
          texture.dispose();
          planeMat.dispose();
          plane.geometry.dispose();
          globe.geometry.dispose();
          (globe.material as InstanceType<typeof THREE.Material>).dispose();
          spriteMap.dispose();
          lightSprite.material.dispose();
          renderer.dispose();
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          host.replaceChildren();
        },
      };
    })();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    apiRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    apiRef.current?.setMode(mode);
  }, [mode]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={hostRef} className="absolute inset-0" />
      {status !== "ready" ? (
        <div className="absolute inset-0 z-[1] grid place-items-center rounded-xl bg-[#101012]/90 text-sm text-white/55">
          {status === "error"
            ? "原图加载失败，请换一张图重试"
            : "正在加载原图…"}
        </div>
      ) : null}
    </div>
  );
}
