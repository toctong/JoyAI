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

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function resolvePlayableSrc(src: string) {
  if (!/^https?:/i.test(src)) return { url: src, revoke: () => {} };
  const blob = await apiFetchBlob("/media/fetch", {
    params: { url: src, kind: "audio" },
    timeoutMs: 120_000,
  });
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
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
 * Colors follow light / dark theme (next-themes `.dark`).
 */
export function CanvasAudioPlayer({ src, className }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const hostRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<{
    destroy: () => void;
    playPause: () => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    setTime: (time: number) => void;
    setOptions: (opts: Record<string, unknown>) => void;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src) return;

    let destroyed = false;
    let revoke = () => {};
    let resizeObserver: ResizeObserver | null = null;
    setReady(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);

    void (async () => {
      try {
        const [{ default: WaveSurfer }, playable] = await Promise.all([
          import("wavesurfer.js"),
          resolvePlayableSrc(src),
        ]);
        if (destroyed || !hostRef.current) {
          playable.revoke();
          return;
        }
        revoke = playable.revoke;

        const measure = () =>
          Math.max(88, Math.floor(hostRef.current?.clientHeight || 120));

        const ws = WaveSurfer.create({
          container: hostRef.current,
          url: playable.url,
          height: measure(),
          barWidth: 1,
          barGap: 0,
          barRadius: 0,
          barAlign: "center",
          cursorWidth: 1,
          ...waveColors(document.documentElement.classList.contains("dark")),
          normalize: true,
          interact: false,
          dragToSeek: false,
          hideScrollbar: true,
          fillParent: true,
        });

        wavesurferRef.current = ws;

        resizeObserver = new ResizeObserver(() => {
          if (destroyed || !wavesurferRef.current) return;
          wavesurferRef.current.setOptions({ height: measure() });
        });
        resizeObserver.observe(hostRef.current);

        const syncTime = () => {
          setCurrent(ws.getCurrentTime());
          setDuration(ws.getDuration());
        };

        ws.on("ready", () => {
          if (destroyed) return;
          setReady(true);
          syncTime();
          ws.setOptions({ height: measure() });
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
      resizeObserver?.disconnect();
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
      revoke();
    };
  }, [src]);

  useEffect(() => {
    wavesurferRef.current?.setOptions(waveColors(dark));
  }, [dark]);

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
