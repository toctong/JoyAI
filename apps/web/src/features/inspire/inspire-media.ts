import type { CSSProperties } from "react";
import { staticAssetUrl } from "@/shared/lib/static-asset";

/** Cinematic inspire stage media — paired stills + 1s transition clips. */
export const INSPIRE_MEDIA = {
  heroes: [
    staticAssetUrl("/inspire/hero-01.webp"),
    staticAssetUrl("/inspire/hero-02.webp"),
    staticAssetUrl("/inspire/hero-03.webp"),
  ],
  depths: [
    staticAssetUrl("/inspire/depth-01.png"),
    staticAssetUrl("/inspire/depth-02.png"),
    staticAssetUrl("/inspire/depth-03.png"),
  ],
  /** index 0: scene 0↔1, index 1: scene 1↔2 — mp4 stays local (not on CDN). */
  covers: [
    { forward: "/inspire/cover-01.mp4", reverse: "/inspire/cover-01-reverse.mp4" },
    { forward: "/inspire/cover-02.mp4", reverse: "/inspire/cover-02-reverse.mp4" },
  ],
} as const;

export const INSPIRE_SCENE_COUNT = 3;

export type InspireTransition = {
  from: number;
  to: number;
  /** Which cover clip pair (0 or 1) */
  index: number;
  reverse: boolean;
};

export function clampScene(n: number) {
  return Math.min(INSPIRE_SCENE_COUNT - 1, Math.max(0, n));
}

/** Adjacent scene step; returns null if no-op. */
export function buildTransition(
  from: number,
  to: number,
): InspireTransition | null {
  const a = clampScene(from);
  const b = clampScene(to);
  if (a === b) return null;
  return {
    from,
    to,
    index: Math.min(a, b),
    reverse: b < a,
  };
}

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function smoothstep(n: number) {
  const t = clamp01(n);
  return t * t * (3 - 2 * t);
}

export function lineDelay(i: number): CSSProperties {
  return { ["--line-delay" as string]: `${i * 70}ms` };
}
