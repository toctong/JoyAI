"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { apiFetchBlob } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import { CanvasIconPause, CanvasIconPlay } from "./icons/canvas-icons";
import "./canvas-audio-player.css";

type Props = {
  src: string;
  className?: string;
};

type WaveSurferLike = {
  destroy: () => void;
  playPause: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setTime: (time: number) => void;
  setOptions: (opts: Record<string, unknown>) => void;
  on: (event: string, cb: () => void) => void;
};

/** Keep blob URLs across remounts so drag / raiseNodes doesn't blank the wave. */
const playableCache = new Map<string, { url: string; refs: number }>();

async function acquirePlayable(src: string) {
  if (!/^https?:/i.test(src)) {
    return { url: src, release: () => {} };
  }
  const hit = playableCache.get(src);
  if (hit) {
    hit.refs += 1;
    return {
      url: hit.url,
      release: () => releasePlayable(src),
    };
  }
  const blob = await apiFetchBlob("/media/fetch", {
    params: { url: src, kind: "audio" },
    timeoutMs: 120_000,
  });
  const objectUrl = URL.createObjectURL(blob);
  playableCache.set(src, { url: objectUrl, refs: 1 });
  return {
    url: objectUrl,
    release: () => releasePlayable(src),
  };
}

function releasePlayable(src: string) {
  const hit = playableCache.get(src);
  if (!hit) return;
  hit.refs -= 1;
  if (hit.refs > 0) return;
  playableCache.delete(src);
  URL.revokeObjectURL(hit.url);
}

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function waveColors(dark: boolean) {
  return dark
    ? {
        cursorColor: "rgba(255,255,255,0.95)",
        waveColor: "rgba(255,255,255,0.32)",
        progressColor: "#ffffff",
      }
    : {
        cursorColor: "#18181b",
        waveColor: "rgba(24,24,27,0.28)",
        progressColor: "#18181b",
      };
}

/**
 * Canvas audio node player — Wavesurfer bar waveform.
 * Avoid setOptions(height) on resize: canvas scale + raiseNodes was blanking the wave.
 */
export function CanvasAudioPlayer({ src, className }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurferLike | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) return;

    let destroyed = false;
    let release = () => {};
    setReady(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    host.replaceChildren();

    void (async () => {
      try {
        const [{ default: WaveSurfer }, playable] = await Promise.all([
          import("wavesurfer.js"),
          acquirePlayable(src),
        ]);
        if (destroyed || !hostRef.current) {
          playable.release();
          return;
        }
        release = playable.release;

        const ws = WaveSurfer.create({
          container: hostRef.current,
          url: playable.url,
          height: "auto",
          barWidth: 1,
          barGap: 0,
          barRadius: 0,
          cursorWidth: 1,
          ...waveColors(document.documentElement.classList.contains("dark")),
          normalize: true,
          interact: false,
          dragToSeek: false,
          hideScrollbar: true,
          fillParent: true,
        }) as WaveSurferLike;

        if (destroyed) {
          ws.destroy();
          release();
          return;
        }

        wavesurferRef.current = ws;

        const syncTime = () => {
          const nextDuration = ws.getDuration();
          const nextCurrent = ws.getCurrentTime();
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(nextDuration);
          }
          if (Number.isFinite(nextCurrent)) {
            setCurrent(nextCurrent);
          }
        };

        ws.on("ready", () => {
          if (destroyed) return;
          setReady(true);
          syncTime();
        });
        ws.on("audioprocess", syncTime);
        ws.on("seeking", syncTime);
        ws.on("timeupdate", syncTime);
        ws.on("play", () => setPlaying(true));
        ws.on("pause", () => setPlaying(false));
        ws.on("finish", () => {
          setPlaying(false);
          setCurrent(ws.getDuration());
        });
      } catch {
        if (!destroyed) setReady(false);
      }
    })();

    return () => {
      destroyed = true;
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
      release();
      host.replaceChildren();
    };
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    wavesurferRef.current?.setOptions(waveColors(dark));
  }, [dark, ready]);

  /** After canvas drag / zoom, recover if WaveSurfer left an empty host. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let timer = 0;
    const recover = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const host = hostRef.current;
        const ws = wavesurferRef.current;
        if (!host || !ws || !ready) return;
        if (host.querySelector("canvas")) return;
        ws.setOptions({});
      }, 40);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) recover();
      },
      { threshold: 0.05 },
    );
    observer.observe(root);
    window.addEventListener("pointerup", recover);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("pointerup", recover);
    };
  }, [ready, src]);

  const pressRef = useRef<{ x: number; y: number } | null>(null);

  function seekAt(clientX: number) {
    const host = hostRef.current;
    const ws = wavesurferRef.current;
    if (!host || !ws) return;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const next = ws.getDuration() * ratio;
    if (!Number.isFinite(next)) return;
    ws.setTime(next);
    setCurrent(next);
  }

  return (
    <div
      ref={rootRef}
      className={cn("joy-canvas-audio", className)}
      data-canvas-shortcuts-ignore
      onDragStart={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest(".joy-canvas-audio-play")) {
          return;
        }
        pressRef.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = pressRef.current;
        pressRef.current = null;
        if (!start || !ready) return;
        if ((event.target as HTMLElement).closest(".joy-canvas-audio-play")) {
          return;
        }
        const moved = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        );
        if (moved > 5) return;
        seekAt(event.clientX);
      }}
    >
      <div className="joy-canvas-audio-wave" ref={hostRef} />
      <div className="joy-canvas-audio-bar">
        <span className="joy-canvas-audio-time tabular-nums">
          {formatClock(current)} / {formatClock(duration)}
        </span>
        <button
          type="button"
          className="joy-canvas-audio-play"
          title={playing ? "暂停" : "播放"}
          aria-label={playing ? "暂停" : "播放"}
          disabled={!ready}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            wavesurferRef.current?.playPause();
          }}
        >
          {playing ? (
            <CanvasIconPause className="size-3.5" />
          ) : (
            <CanvasIconPlay className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
