"use client";

/**
 * Three.js lighting preview — image on a plane + directional/rim lights.
 * Params drive light direction; AI still re-renders from prompt.
 */

import { useEffect, useRef } from "react";
import type { LightingParams } from "./lighting-prompt";

type Props = {
  url: string;
  params: LightingParams;
  mode: "original" | "preview" | "front";
  className?: string;
};

export function LightingThreePreview({
  url,
  params,
  mode,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{
    setParams: (p: LightingParams) => void;
    setMode: (m: Props["mode"]) => void;
    dispose: () => void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;

    void (async () => {
      const THREE = await import("three");
      if (disposed || !hostRef.current) return;

      const width = Math.max(320, host.clientWidth || 640);
      const height = Math.max(280, host.clientHeight || 420);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121212);

      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
      camera.position.set(0, 0.15, 2.6);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.replaceChildren(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.borderRadius = "12px";

      const ambient = new THREE.AmbientLight(0xffffff, 0.22);
      scene.add(ambient);

      const key = new THREE.DirectionalLight(0xfff2d6, 1.35);
      key.position.set(0, 0.8, 1.4);
      scene.add(key);
      scene.add(key.target);

      const fill = new THREE.DirectionalLight(0xb8d4ff, 0.25);
      fill.position.set(-1.2, 0.2, 0.6);
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xffffff, 0);
      rim.position.set(0, 0.4, -1.5);
      scene.add(rim);

      const lightHelper = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffd27a }),
      );
      scene.add(lightHelper);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(1.6, 48),
        new THREE.MeshStandardMaterial({
          color: 0x1a1a1a,
          roughness: 0.92,
          metalness: 0.05,
        }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.72;
      scene.add(floor);

      const grid = new THREE.GridHelper(3.2, 16, 0x2a2a2a, 0x1e1e1e);
      grid.position.y = -0.71;
      scene.add(grid);

      let plane: InstanceType<typeof THREE.Mesh> | null = null;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(
        url,
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          const img = texture.image as { width?: number; height?: number };
          const iw = img?.width || 1;
          const ih = img?.height || 1;
          const aspect = iw / ih;
          const h = 1.35;
          const w = h * aspect;
          const geo = new THREE.PlaneGeometry(w, h);
          const mat = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.55,
            metalness: 0.05,
          });
          plane = new THREE.Mesh(geo, mat);
          plane.position.y = 0;
          scene.add(plane);
        },
        undefined,
        () => {
          /* keep empty stage if texture fails */
        },
      );

      let currentMode: Props["mode"] = mode;
      let latestParams = params;
      let raf = 0;

      function applyParams(p: LightingParams) {
        latestParams = p;
        const az = (p.azimuth * Math.PI) / 180;
        const el = (p.elevation * Math.PI) / 180;
        const dist = 2.2;
        const x = Math.sin(az) * Math.cos(el) * dist;
        const y = Math.sin(el) * dist;
        const z = Math.cos(az) * Math.cos(el) * dist;
        key.position.set(x, y, z);
        key.target.position.set(0, 0, 0);
        key.target.updateMatrixWorld();
        lightHelper.position.copy(key.position);

        const warm = p.temperature < 4500;
        const cool = p.temperature > 6500;
        key.color.set(
          warm ? 0xffc98a : cool ? 0xd8e7ff : 0xfff2d6,
        );
        key.intensity = 0.55 + (p.brightness / 100) * 1.4;
        ambient.intensity =
          currentMode === "original" ? 1.05 : 0.18 + (1 - p.brightness / 100) * 0.12;
        rim.intensity = p.rim && currentMode !== "original" ? 0.85 : 0;
        fill.intensity = currentMode === "original" ? 0.35 : 0.22;

        if (currentMode === "front") {
          camera.position.set(0, 0, 2.55);
          camera.lookAt(0, 0, 0);
        } else if (currentMode === "original") {
          camera.position.set(0, 0, 2.4);
          camera.lookAt(0, 0, 0);
          key.intensity = 0.05;
          ambient.intensity = 1.15;
        } else {
          camera.position.set(0.55, 0.35, 2.45);
          camera.lookAt(0, 0, 0);
        }
        lightHelper.visible = currentMode === "preview";
        grid.visible = currentMode !== "original";
        floor.visible = currentMode !== "original";
      }

      applyParams(params);

      const onResize = () => {
        if (!hostRef.current) return;
        const w = Math.max(320, hostRef.current.clientWidth);
        const h = Math.max(280, hostRef.current.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
      };
      const ro = new ResizeObserver(onResize);
      ro.observe(host);

      const tick = () => {
        if (disposed) return;
        raf = requestAnimationFrame(tick);
        renderer.render(scene, camera);
      };
      tick();

      apiRef.current = {
        setParams: (p) => applyParams(p),
        setMode: (m) => {
          currentMode = m;
          applyParams(latestParams);
        },
        dispose: () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          if (plane) {
            const mat = plane.material as InstanceType<
              typeof THREE.MeshStandardMaterial
            >;
            mat.map?.dispose();
            mat.dispose();
            plane.geometry.dispose();
          }
          renderer.dispose();
          host.replaceChildren();
        },
      };
    })();

    return () => {
      disposed = true;
      apiRef.current?.dispose();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once per url
  }, [url]);

  useEffect(() => {
    apiRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    apiRef.current?.setMode(mode);
    apiRef.current?.setParams(params);
  }, [mode, params]);

  return <div ref={hostRef} className={className} />;
}
