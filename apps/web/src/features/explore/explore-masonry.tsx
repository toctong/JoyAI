"use client";

import { memo, useEffect, useRef, useState, type Ref } from "react";
import Masonry from "react-masonry-css";
import { GitFork, Heart, Loader2, Play, WandSparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import type { ExploreFeedItem } from "./types";
import "./explore-masonry.css";

const BREAKPOINT_COLS = {
  default: 6,
  1280: 5,
  1024: 4,
  640: 2,
  0: 1,
};

/** First-screen images load eagerly; the rest stay lazy. */
const EAGER_MEDIA_COUNT = 8;

type Props = {
  items: ExploreFeedItem[];
  loadingMore?: boolean;
  onOpen: (item: ExploreFeedItem) => void;
  onRemix: (item: ExploreFeedItem) => void;
};

function stillPoster(item: ExploreFeedItem): string | null {
  const thumb = item.thumbnailUrl?.trim() || "";
  const media = item.mediaUrl?.trim() || "";
  if (!thumb || thumb === media) return null;
  if (/\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(thumb)) return null;
  return thumb;
}

function videoMime(url: string): string {
  const path = url.split("?")[0]?.split("#")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".webm")) return "video/webm";
  if (path.endsWith(".ogg") || path.endsWith(".ogv")) return "video/ogg";
  if (path.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function seekPreviewFrame(el: HTMLVideoElement) {
  if (el.error || el.seekable.length === 0) return;
  const duration = el.duration;
  const t =
    Number.isFinite(duration) && duration > 0.2
      ? Math.min(0.12, duration / 2)
      : 0;
  if (t <= 0) return;
  try {
    if (Math.abs(el.currentTime - t) > 0.02) el.currentTime = t;
  } catch {
    // ignore
  }
}

function primeVideoFrame(el: HTMLVideoElement) {
  if (el.dataset.primed === "1" || !el.paused) return;
  el.dataset.primed = "1";
  seekPreviewFrame(el);
}

function playPreview(el: HTMLVideoElement) {
  if (el.error || !el.currentSrc) return;
  void el.play().catch(() => undefined);
}

const MIN_CARD_AR = 9 / 16;
const MAX_CARD_AR = 16 / 9;

function parseAspectParts(item: ExploreFeedItem): { w: number; h: number } | null {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return { w: item.width, h: item.height };
  }
  const ar = item.aspectRatio?.trim();
  if (!ar) return null;
  if (ar.includes(":")) {
    const [a, b] = ar.split(":").map((x) => Number(x.trim()));
    if (a > 0 && b > 0) return { w: a, h: b };
  }
  if (ar.includes("/")) {
    const [a, b] = ar.split("/").map((x) => Number(x.trim()));
    if (a > 0 && b > 0) return { w: a, h: b };
  }
  const n = Number(ar);
  if (Number.isFinite(n) && n > 0) return { w: n, h: 1 };
  return null;
}

function resolveAspectRatio(item: ExploreFeedItem): string {
  const parts = parseAspectParts(item);
  if (parts) {
    const r = parts.w / parts.h;
    if (r > MAX_CARD_AR) return "16 / 9";
    if (r < MIN_CARD_AR) return "9 / 16";
    return `${parts.w} / ${parts.h}`;
  }
  return item.type === "video" ? "9 / 16" : "3 / 4";
}

/** Mount video only when near viewport or user hovers (poster-first). */
function useVideoArm(enabled: boolean, preferHover: boolean) {
  const ref = useRef<HTMLElement | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!enabled || armed) return;
    if (preferHover) return; // wait for hover
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, armed, preferHover]);

  return {
    ref: ref as Ref<HTMLElement>,
    armed,
    arm: () => setArmed(true),
  } as const;
}

const ExploreCard = memo(function ExploreCard({
  item,
  index,
  onOpen,
  onRemix,
}: {
  item: ExploreFeedItem;
  index: number;
  onOpen: (item: ExploreFeedItem) => void;
  onRemix: (item: ExploreFeedItem) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const isVideo = item.type === "video";
  const poster = isVideo ? stillPoster(item) : null;
  const hasPoster = Boolean(poster);
  const ar = resolveAspectRatio(item);
  const eager = index < EAGER_MEDIA_COUNT;
  const reveal = () => setLoaded(true);

  const videoArm = useVideoArm(isVideo && Boolean(item.mediaUrl), hasPoster);
  const showVideo = isVideo && videoArm.armed && Boolean(item.mediaUrl);

  return (
    <article
      ref={videoArm.ref}
      className="joy-explore-card group"
      style={{ aspectRatio: ar }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
      onMouseEnter={() => {
        if (isVideo && item.mediaUrl) videoArm.arm();
      }}
    >
      {!loaded ? (
        <Skeleton className="joy-explore-card-skel" aria-hidden />
      ) : null}

      {isVideo ? (
        <>
          <span className="joy-explore-play" aria-hidden>
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={poster}
              alt=""
              className={cn(
                "joy-explore-media",
                loaded && "is-ready",
                showVideo && "is-under-video",
              )}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={eager ? "high" : "auto"}
              onLoad={reveal}
              onError={reveal}
            />
          ) : null}
          {showVideo ? (
            <video
              className={cn(
                "joy-explore-media",
                "is-ready",
                hasPoster && "is-hover-play",
              )}
              poster={poster || undefined}
              muted
              playsInline
              loop
              preload={hasPoster ? "none" : "metadata"}
              onLoadedMetadata={(e) => {
                reveal();
                primeVideoFrame(e.currentTarget);
              }}
              onLoadedData={reveal}
              onSeeked={reveal}
              onCanPlay={(e) => {
                reveal();
                if (hasPoster) playPreview(e.currentTarget);
              }}
              onError={reveal}
              onMouseEnter={(e) => playPreview(e.currentTarget)}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.pause();
                seekPreviewFrame(el);
              }}
            >
              <source src={item.mediaUrl!} type={videoMime(item.mediaUrl!)} />
            </video>
          ) : null}
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl || item.mediaUrl}
          alt={item.title}
          className={cn("joy-explore-media", loaded && "is-ready")}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
        />
      )}

      <div className="joy-explore-cover">
        <div className="joy-explore-meta-row">
          <div className="joy-explore-author">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.author.avatarUrl || JOYAI_BRAND.remote.avatar}
              alt=""
              className="joy-explore-avatar"
              loading="lazy"
              decoding="async"
            />
            <span className="joy-explore-nickname">
              {item.author.nickname}
            </span>
          </div>
          <div className="joy-explore-stats">
            <span title="复刻">
              <GitFork className="h-3.5 w-3.5" />
              {item.recreateCount ?? 0}
            </span>
            <span title="点赞">
              <Heart className="h-3.5 w-3.5" />
              {item.likeCount ?? 0}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="joy-explore-remix"
          onClick={(e) => {
            e.stopPropagation();
            onRemix(item);
          }}
        >
          <WandSparkles className="h-3.5 w-3.5" />
          一键同款
        </button>
      </div>
    </article>
  );
});

export function ExploreMasonry({
  items,
  loadingMore = false,
  onOpen,
  onRemix,
}: Props) {
  return (
    <>
      <Masonry
        breakpointCols={BREAKPOINT_COLS}
        className="joy-explore-masonry"
        columnClassName="joy-explore-masonry-col"
      >
        {items.map((item, index) => (
          <ExploreCard
            key={item.id}
            item={item}
            index={index}
            onOpen={onOpen}
            onRemix={onRemix}
          />
        ))}
      </Masonry>
      {loadingMore ? (
        <div className="joy-explore-load-more" aria-live="polite">
          <Loader2 className="size-4 animate-spin opacity-60" />
          <span>加载更多…</span>
        </div>
      ) : null}
    </>
  );
}
