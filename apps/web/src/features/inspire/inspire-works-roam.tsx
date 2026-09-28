"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  Pause,
  Play,
  SkipBack,
  Shuffle,
  Volume2,
  VolumeX,
  Maximize,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { tosThumbUrl } from "@/shared/lib/media-url";
import { useReleaseMediaOnUnmount } from "@/shared/lib/use-release-media-on-unmount";
import {
  claimAudibleMedia,
  releaseAudibleMedia,
} from "@/shared/lib/exclusive-audible-media";

export type RoamWork = {
  id: number;
  title: string;
  coverUrl: string;
  videoUrl: string;
  authorName: string;
  authorAvatar: string;
  isPublic: boolean;
};

type Props = {
  /** Playlist for roam only — independent of the grid cards. */
  works: RoamWork[];
};

/** Sample each work briefly then advance — not full-length playback. */
const ROAM_CLIP_MS = 15_000;

/**
 * Featured “作品漫游” — muted clip carousel + circular controls.
 * Advances after ~15s (or sooner if the clip ends / errors).
 */
export function InspireWorksRoam({ works }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const clipLeftRef = useRef(ROAM_CLIP_MS);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  useReleaseMediaOnUnmount(videoRef);

  /** Stable identity — claim/release compare by reference. */
  const stopAudibleRef = useRef(() => {
    setMuted(true);
    const el = videoRef.current;
    if (el) el.muted = true;
    releaseAudibleMedia(stopAudibleRef.current);
  });

  const safeIndex = works.length === 0 ? 0 : Math.min(index, works.length - 1);
  const current = works[safeIndex] ?? null;

  useEffect(() => {
    if (index >= works.length && works.length > 0) {
      setIndex(works.length - 1);
    }
  }, [works.length, index]);

  useEffect(() => {
    clipLeftRef.current = ROAM_CLIP_MS;
  }, [current?.id]);

  useEffect(() => {
    if (!muted && playing) {
      claimAudibleMedia(stopAudibleRef.current);
    } else {
      releaseAudibleMedia(stopAudibleRef.current);
    }
  }, [muted, playing]);

  useEffect(() => () => releaseAudibleMedia(stopAudibleRef.current), []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver !== "function") return;
    const scrollRoot = root.closest(".joy-inspire-inner");
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Pause early while scrolling away — don't keep decoding under the fold.
        setInView(Boolean(entry?.isIntersecting && (entry.intersectionRatio ?? 0) >= 0.35));
      },
      {
        root: scrollRoot instanceof Element ? scrollRoot : null,
        threshold: [0, 0.2, 0.35, 0.5],
      },
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVis = () => setPageVisible(!document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!inView || !pageVisible || !current?.videoUrl) {
      setPlaying(false);
      if (el) {
        try {
          el.pause();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!el) return;
    el.muted = muted;
    if (userPausedRef.current) return;
    void el.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  }, [current?.id, current?.videoUrl, muted, inView, pageVisible]);

  const go = useCallback(
    (delta: number) => {
      if (works.length === 0) return;
      userPausedRef.current = false;
      clipLeftRef.current = ROAM_CLIP_MS;
      setIndex((i) => (i + delta + works.length) % works.length);
    },
    [works.length],
  );

  /** Clip timer only ticks while actually playing. */
  useEffect(() => {
    if (!current?.videoUrl || works.length <= 1) return;
    const ticking =
      playing && inView && pageVisible && !userPausedRef.current;
    if (!ticking) return;

    const startedAt = Date.now();
    const budget = clipLeftRef.current;
    const timer = window.setTimeout(() => {
      clipLeftRef.current = ROAM_CLIP_MS;
      go(1);
    }, budget);

    return () => {
      window.clearTimeout(timer);
      const spent = Date.now() - startedAt;
      clipLeftRef.current = Math.max(0, budget - spent);
    };
  }, [
    current?.videoUrl,
    current?.id,
    playing,
    inView,
    pageVisible,
    works.length,
    go,
  ]);

  function goRandom() {
    if (works.length <= 1) return;
    let next = safeIndex;
    while (next === safeIndex) {
      next = Math.floor(Math.random() * works.length);
    }
    userPausedRef.current = false;
    clipLeftRef.current = ROAM_CLIP_MS;
    setIndex(next);
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      userPausedRef.current = false;
      void el.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    } else {
      userPausedRef.current = true;
      el.pause();
      setPlaying(false);
    }
  }

  function toggleMute() {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) el.muted = next;
    if (!next && (playing || (el && !el.paused))) {
      claimAudibleMedia(stopAudibleRef.current);
    } else {
      releaseAudibleMedia(stopAudibleRef.current);
    }
  }

  async function toggleFullscreen() {
    const stage = videoRef.current?.parentElement;
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (stage?.requestFullscreen) {
        await stage.requestFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      /* ignore */
    }
  }

  if (!current) return null;

  const posterSrc = current.coverUrl
    ? tosThumbUrl(current.coverUrl, "lg") || current.coverUrl
    : "";
  const showVideo = Boolean(current.videoUrl) && inView && pageVisible;

  return (
    <div className="joy-inspire-works-roam" ref={rootRef}>
      <div className="joy-inspire-works-roam-stage">
        <span className="joy-inspire-works-roam-label">作品漫游</span>

        {posterSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`poster-${current.id}`}
            src={posterSrc}
            alt=""
            className="joy-inspire-works-roam-poster"
            draggable={false}
            decoding="async"
          />
        ) : null}

        {showVideo ? (
          <video
            ref={videoRef}
            className="joy-inspire-works-roam-video"
            src={current.videoUrl}
            poster={posterSrc || undefined}
            playsInline
            muted={muted}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              if (inView && pageVisible) go(1);
            }}
            onError={() => {
              if (inView && pageVisible) go(1);
            }}
            onDoubleClick={() => void toggleFullscreen()}
          />
        ) : !current.coverUrl && !current.videoUrl ? (
          <div className="joy-inspire-works-roam-empty" />
        ) : null}

        <div className="joy-inspire-works-roam-controls">
          <button
            type="button"
            className="joy-inspire-works-roam-btn"
            aria-label="上一条"
            onClick={() => go(-1)}
          >
            <SkipBack />
          </button>
          <button
            type="button"
            className="joy-inspire-works-roam-btn"
            aria-label={playing ? "暂停" : "播放"}
            onClick={togglePlay}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <button
            type="button"
            className="joy-inspire-works-roam-btn"
            aria-label="随机下一条"
            onClick={goRandom}
          >
            <Shuffle />
          </button>
          <button
            type="button"
            className={cn(
              "joy-inspire-works-roam-btn",
              muted && "is-muted",
            )}
            aria-label={muted ? "取消静音" : "静音"}
            onClick={toggleMute}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            type="button"
            className="joy-inspire-works-roam-btn"
            aria-label="全屏"
            onClick={() => void toggleFullscreen()}
          >
            <Maximize />
          </button>
        </div>
      </div>

      <div className="joy-inspire-works-meta">
        <div className="joy-inspire-works-author">
          {current.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.authorAvatar}
              alt=""
              className="joy-inspire-works-avatar"
            />
          ) : (
            <span className="joy-inspire-works-avatar is-empty" />
          )}
          <span className="joy-inspire-works-author-name">
            {current.authorName}
          </span>
          {current.isPublic ? (
            <span className="joy-inspire-works-public">
              <LayoutGrid
                className="joy-inspire-works-public-icon"
                aria-hidden
              />
              公开
            </span>
          ) : null}
        </div>
        <div className="joy-inspire-works-title-row">
          <p className="joy-inspire-works-name">{current.title}</p>
        </div>
      </div>
    </div>
  );
}
