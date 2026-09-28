"use client";

import { useEffect, useRef, useState } from "react";
import { Heart, ArrowUpRight, LayoutGrid } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { tosThumbUrl } from "@/shared/lib/media-url";
import {
  VIDEO_HOVER_PREVIEW_DELAY_MS,
  claimVideoHoverPreview,
  releaseVideoHoverPreview,
  shouldSkipVideoHoverPreview,
  stopHoverVideo,
} from "@/shared/lib/video-feed-preview";

export type InspireWorkCardData = {
  id: number;
  title: string;
  coverUrl: string;
  videoUrl: string;
  authorName: string;
  authorAvatar: string;
  likeCount: number;
  isPublic: boolean;
};

type Props = {
  work: InspireWorkCardData;
  onOpen?: () => void;
};

/** Grid card — hover muted preview; click opens fullscreen detail. */
export function InspireWorksCard({ work, onOpen }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const hasVideo = Boolean(work.videoUrl);
  const coverSrc = work.coverUrl
    ? tosThumbUrl(work.coverUrl, "md") || work.coverUrl
    : "";

  const ctlRef = useRef({
    clearTimer() {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    stop() {
      ctlRef.current.clearTimer();
      stopHoverVideo(videoRef.current);
      setPreviewing(false);
      releaseVideoHoverPreview(ctlRef.current.stop);
    },
  });

  function onEnter() {
    if (!hasVideo || shouldSkipVideoHoverPreview()) return;
    ctlRef.current.clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      claimVideoHoverPreview(ctlRef.current.stop);
      setPreviewing(true);
    }, VIDEO_HOVER_PREVIEW_DELAY_MS);
  }

  function onLeave() {
    if (!hasVideo) return;
    ctlRef.current.stop();
  }

  useEffect(() => () => ctlRef.current.stop(), []);

  useEffect(() => {
    if (!previewing || !hasVideo) return;
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => undefined);
  }, [previewing, hasVideo, work.videoUrl]);

  return (
    <article
      className={cn(
        "joy-inspire-works-card",
        previewing && "is-previewing",
      )}
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => {
        ctlRef.current.stop();
        onOpen?.();
      }}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ctlRef.current.stop();
          onOpen();
        }
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="joy-inspire-works-cover">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt=""
            loading="lazy"
            decoding="async"
            className={cn(previewing && hasVideo && "is-under-video")}
          />
        ) : !previewing ? (
          <span className="joy-inspire-works-cover-empty" />
        ) : null}

        {previewing && hasVideo ? (
          <video
            ref={videoRef}
            className="joy-inspire-works-preview"
            src={work.videoUrl}
            poster={coverSrc || undefined}
            muted
            playsInline
            loop
            autoPlay
            preload="metadata"
          />
        ) : null}

        {hasVideo ? (
          <span className="joy-inspire-works-open" aria-hidden>
            <ArrowUpRight className="joy-inspire-works-open-icon" />
          </span>
        ) : null}
      </div>
      <div className="joy-inspire-works-meta">
        <div className="joy-inspire-works-author">
          {work.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={work.authorAvatar}
              alt=""
              className="joy-inspire-works-avatar"
              loading="lazy"
            />
          ) : (
            <span className="joy-inspire-works-avatar is-empty" />
          )}
          <span className="joy-inspire-works-author-name">
            {work.authorName}
          </span>
          {work.isPublic ? (
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
          <p className="joy-inspire-works-name">{work.title}</p>
          <span className="joy-inspire-works-likes">
            <Heart className="joy-inspire-works-heart" aria-hidden />
            {work.likeCount}
          </span>
        </div>
      </div>
    </article>
  );
}
