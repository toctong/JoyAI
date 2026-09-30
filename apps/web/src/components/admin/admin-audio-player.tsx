"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { useTheme } from "next-themes";
import { apiFetchBlob } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";
import {
  claimAudibleMedia,
  releaseAudibleMedia,
} from "@/shared/lib/exclusive-audible-media";
import "./admin-audio-player.css";

type Props = {
  src: string;
  className?: string;
};

type WaveSurferLike = {
  destroy: () => void;
  play: () => void;
  pause: () => void;
  playPause: () => void;
  isPlaying: () => boolean;
  getCurrentTime: () => number;
  getDuration: () => number;
  setTime: (time: number) => void;
  setOptions: (opts: Record<string, unknown>) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

/** Cache blob URLs so table remounts don't re-download. */
const playableCache = new Map<string, { url: string; refs: number }>();

async function acquirePlayable(src: string) {
  if (!/^https?:/i.test(src)) {
    return { url: src, release: () => {} };
  }
  const hit = playableCache.get(src);
  if (hit) {
    hit.refs += 1;
    return { url: hit.url, release: () => releasePlayable(src) };
  }
  const blob = await apiFetchBlob("/media/fetch", {
    params: { url: src, kind: "audio" },
    timeoutMs: 120_000,
  });
  const objectUrl = URL.createObjectURL(blob);
  playableCache.set(src, { url: objectUrl, refs: 1 });
  return { url: objectUrl, release: () => releasePlayable(src) };
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
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function waveColors(dark: boolean) {
  return dark
    ? {
        cursorColor: "rgba(255,255,255,0.9)",
        waveColor: "rgba(255,255,255,0.28)",
        progressColor: "#fafafa",
      }
    : {
        cursorColor: "#18181b",
        waveColor: "rgba(24,24,27,0.22)",
        progressColor: "#18181b",
      };
}

/**
 * Compact WaveSurfer strip for admin voice tables / drawers.
 * Replaces Plyr for TTS preview — exclusive audible with the rest of the app.
 */
function AdminAudioPlayerInner({ src, className }: Props) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const hostRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurferLike | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !src.trim()) return;

    let destroyed = false;
    let release = () => {};
    setReady(false);
    setLoading(true);
    setError(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    host.replaceChildren();

    const stopAudible = () => {
      try {
        wavesurferRef.current?.pause();
      } catch {
        /* ignore */
      }
      releaseAudibleMedia(stopAudible);
    };
    stopRef.current = stopAudible;

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
          height: 28,
          barWidth: 2,
          barGap: 1,
          barRadius: 1,
          cursorWidth: 1,
          ...waveColors(document.documentElement.classList.contains("dark")),
          normalize: true,
          interact: true,
          dragToSeek: true,
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
          setLoading(false);
          syncTime();
        });
        ws.on("error", () => {
          if (destroyed) return;
          setError(true);
          setLoading(false);
          setReady(false);
        });
        ws.on("audioprocess", syncTime);
        ws.on("seeking", syncTime);
        ws.on("timeupdate", syncTime);
        ws.on("play", () => {
          setPlaying(true);
          claimAudibleMedia(stopAudible);
        });
        ws.on("pause", () => {
          setPlaying(false);
          releaseAudibleMedia(stopAudible);
        });
        ws.on("finish", () => {
          setPlaying(false);
          setCurrent(ws.getDuration());
          releaseAudibleMedia(stopAudible);
        });
      } catch {
        if (!destroyed) {
          setError(true);
          setLoading(false);
          setReady(false);
        }
      }
    })();

    return () => {
      destroyed = true;
      releaseAudibleMedia(stopAudible);
      try {
        wavesurferRef.current?.destroy();
      } catch {
        /* ignore */
      }
      wavesurferRef.current = null;
      release();
      host.replaceChildren();
    };
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    wavesurferRef.current?.setOptions(waveColors(dark));
  }, [dark, ready]);

  return (
    <div
      className={cn("joy-admin-audio", className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="joy-admin-audio-play"
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
        disabled={!ready || error}
        onClick={() => {
          const ws = wavesurferRef.current;
          if (!ws) return;
          if (ws.isPlaying()) {
            ws.pause();
          } else {
            claimAudibleMedia(stopRef.current);
            ws.play();
          }
        }}
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : playing ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </button>
      <div className="joy-admin-audio-wave" ref={hostRef} />
      <span className="joy-admin-audio-time tabular-nums">
        {error
          ? "失败"
          : `${formatClock(current)} / ${formatClock(duration)}`}
      </span>
    </div>
  );
}

export const AdminAudioPlayer = memo(AdminAudioPlayerInner);
