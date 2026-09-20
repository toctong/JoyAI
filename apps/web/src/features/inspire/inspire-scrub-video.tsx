"use client";

import { useEffect, useRef, useState } from "react";
import {
  clamp01,
  INSPIRE_MEDIA,
  type InspireTransition,
} from "./inspire-media";

const FALLBACK_MS = 1000;
const ERROR_TIMEOUT_MS = 12_000;

type Props = {
  index: 0 | 1;
  reverse: boolean;
  prepared: boolean;
  active: InspireTransition | null;
  onProgress: (t: number) => void;
  onFinish: () => void;
};

/**
 * Plays a 1s cover clip as the bridge between two static hero frames.
 * Falls back to a 1s synthetic progress if the video errors / stalls.
 */
export function InspireScrubVideo({
  index,
  reverse,
  prepared,
  active,
  onProgress,
  onFinish,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.pause();
      setPlaying(false);
      return;
    }

    let cancelled = false;
    let started = false;
    let fallback = false;
    let raf = 0;
    let fallbackStart = 0;

    setPlaying(false);

    const finish = () => {
      if (!cancelled) onFinish();
    };

    const tick = () => {
      if (cancelled) return;
      const t = fallback
        ? (performance.now() - fallbackStart) / FALLBACK_MS
        : el.currentTime / (el.duration || 1);
      const p = clamp01(t);
      onProgress(p);
      if (fallback && p >= 1) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    const startFallback = () => {
      if (cancelled || fallback) return;
      fallback = true;
      fallbackStart = performance.now();
      el.pause();
      setPlaying(false);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    const errorTimer = window.setTimeout(startFallback, ERROR_TIMEOUT_MS);

    const start = () => {
      if (started || cancelled || fallback || !Number.isFinite(el.duration)) {
        return;
      }
      started = true;
      el.currentTime = 0;
      el.playbackRate = 1;

      const targetStill = el
        .closest(".joy-inspire-stage")
        ?.querySelector<HTMLImageElement>(
          `[data-static-scene="${clampSceneTarget(active.to)}"]`,
        );

      void Promise.resolve(targetStill?.decode().catch(() => undefined))
        .then(() => {
          if (!cancelled && !fallback) return el.play();
        })
        .then(() => {
          if (cancelled || fallback) return;
          setPlaying(true);
          raf = requestAnimationFrame(tick);
        })
        .catch(startFallback);
    };

    el.addEventListener("canplaythrough", start);
    el.addEventListener("ended", finish);
    el.addEventListener("error", startFallback);
    if (el.error) startFallback();
    else if (el.readyState >= 4) start();

    return () => {
      cancelled = true;
      window.clearTimeout(errorTimer);
      el.pause();
      cancelAnimationFrame(raf);
      el.removeEventListener("canplaythrough", start);
      el.removeEventListener("ended", finish);
      el.removeEventListener("error", startFallback);
    };
  }, [active, onFinish, onProgress]);

  const src = reverse
    ? INSPIRE_MEDIA.covers[index].reverse
    : INSPIRE_MEDIA.covers[index].forward;

  return (
    <video
      ref={ref}
      className="joy-inspire-media joy-inspire-scrub"
      style={{ opacity: active && playing ? 1 : 0 }}
      src={src}
      preload={prepared || active ? "auto" : "none"}
      muted
      playsInline
      aria-hidden
    />
  );
}

function clampSceneTarget(n: number) {
  return Math.min(2, Math.max(0, n));
}
