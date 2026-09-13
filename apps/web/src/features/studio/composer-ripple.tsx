"use client";

import { useEffect, useRef } from "react";

type Blob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  alpha: number;
};

/**
 * Idle-only liquid light blooms (replaces ring ripples).
 * Soft drifting orbs — closer to Jimeng ambient glow than click ripples.
 */
export function ComposerRipple({ idle }: { idle: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobsRef = useRef<Blob[]>([]);
  const rafRef = useRef(0);
  const idleRef = useRef(idle);
  idleRef.current = idle;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const shell = canvas.parentElement;
    const parent = shell?.parentElement;
    if (!shell || !parent) return;

    const seed = (w: number, h: number) => {
      const hues = [210, 255, 290, 195];
      blobsRef.current = hues.map((hue, i) => ({
        x: w * (0.2 + (i % 3) * 0.25 + Math.random() * 0.08),
        y: h * (0.25 + (i % 2) * 0.35 + Math.random() * 0.1),
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.16,
        r: Math.min(w, h) * (0.28 + Math.random() * 0.18),
        hue,
        alpha: 0.1 + Math.random() * 0.06,
      }));
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (blobsRef.current.length === 0) seed(rect.width, rect.height);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const tick = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, w, h);

      if (!idleRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (blobsRef.current.length === 0) seed(w, h);

      const t = performance.now() / 1000;

      // Soft base veil
      const veil = ctx.createLinearGradient(0, 0, w, h);
      veil.addColorStop(0, "rgba(90, 140, 255, 0.03)");
      veil.addColorStop(0.5, "rgba(160, 90, 255, 0.025)");
      veil.addColorStop(1, "rgba(255, 140, 200, 0.02)");
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";

      for (const b of blobsRef.current) {
        b.x += b.vx + Math.sin(t * 0.4 + b.hue) * 0.08;
        b.y += b.vy + Math.cos(t * 0.35 + b.hue * 0.01) * 0.06;

        // Bounce softly inside bounds
        if (b.x < -b.r * 0.2 || b.x > w + b.r * 0.2) b.vx *= -1;
        if (b.y < -b.r * 0.2 || b.y > h + b.r * 0.2) b.vy *= -1;
        b.x = Math.min(w + b.r * 0.2, Math.max(-b.r * 0.2, b.x));
        b.y = Math.min(h + b.r * 0.2, Math.max(-b.r * 0.2, b.y));

        const pulse = 0.85 + Math.sin(t * 0.9 + b.hue) * 0.15;
        const radius = b.r * pulse;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
        g.addColorStop(0, `hsla(${b.hue}, 85%, 72%, ${b.alpha})`);
        g.addColorStop(0.45, `hsla(${b.hue + 20}, 70%, 60%, ${b.alpha * 0.35})`);
        g.addColorStop(1, `hsla(${b.hue}, 70%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";

      // Thin specular streak sweeping slowly
      const sx = ((t * 28) % (w + 160)) - 80;
      const streak = ctx.createLinearGradient(sx, 0, sx + 120, h);
      streak.addColorStop(0, "rgba(255,255,255,0)");
      streak.addColorStop(0.5, "rgba(220, 235, 255, 0.045)");
      streak.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = streak;
      ctx.fillRect(0, 0, w, h);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className="joy-composer-ripple"
      aria-hidden
      data-idle={idle ? "" : undefined}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
