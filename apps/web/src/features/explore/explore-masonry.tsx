"use client";

import { useState } from "react";
import Masonry from "react-masonry-css";
import { GitFork, Heart, Play, WandSparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";
import type { ExploreFeedItem } from "./types";
import "./explore-masonry.css";

const BREAKPOINT_COLS = {
  default: 5,
  1280: 4,
  1024: 3,
  640: 2,
  0: 1,
};

const LOAD_MORE_PLACEHOLDERS = [240, 300, 220, 280, 260, 320, 230, 290];

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

/** 让浏览器在未播放时就解码一帧，避免卡片一直停在骨架上。 */
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
    // 部分源不允许 seek，保留当前帧
  }
}

function primeVideoFrame(el: HTMLVideoElement) {
  if (el.dataset.primed === "1" || !el.paused) return;
  el.dataset.primed = "1";
  seekPreviewFrame(el);
}

function playPreview(el: HTMLVideoElement) {
  if (el.error || !el.currentSrc) return;
  void el.play().catch(() => {
    // 源尚未就绪或不支持时，play() 会 reject，不能冒泡成未捕获异常
  });
}

/** Clamp extreme cover ratios (Civitai banners etc.) so masonry cards stay usable. */
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

function ExploreCard({
  item,
  onOpen,
  onRemix,
}: {
  item: ExploreFeedItem;
  onOpen: (item: ExploreFeedItem) => void;
  onRemix: (item: ExploreFeedItem) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const isVideo = item.type === "video";
  const poster = isVideo ? stillPoster(item) : null;
  const ar = resolveAspectRatio(item);
  const reveal = () => setLoaded(true);

  return (
    <article
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
              className={cn("joy-explore-media", loaded && "is-ready")}
              loading="lazy"
              decoding="async"
              onLoad={reveal}
              onError={reveal}
            />
          ) : null}
          <video
            className={cn(
              "joy-explore-media",
              loaded && "is-ready",
              poster && "is-hover-play",
            )}
            poster={poster || undefined}
            muted
            playsInline
            loop
            preload="metadata"
            onLoadedMetadata={(e) => {
              reveal();
              primeVideoFrame(e.currentTarget);
            }}
            onLoadedData={reveal}
            onSeeked={reveal}
            onCanPlay={reveal}
            onError={reveal}
            onMouseEnter={(e) => playPreview(e.currentTarget)}
            onMouseLeave={(e) => {
              const el = e.currentTarget;
              el.pause();
              seekPreviewFrame(el);
            }}
          >
            {item.mediaUrl ? (
              <source src={item.mediaUrl} type={videoMime(item.mediaUrl)} />
            ) : null}
          </video>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnailUrl || item.mediaUrl}
          alt={item.title}
          className={cn("joy-explore-media", loaded && "is-ready")}
          loading="lazy"
          decoding="async"
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
}

export function ExploreMasonry({
  items,
  loadingMore = false,
  onOpen,
  onRemix,
}: Props) {
  return (
    <Masonry
      breakpointCols={BREAKPOINT_COLS}
      className="joy-explore-masonry"
      columnClassName="joy-explore-masonry-col"
    >
      {items.map((item) => (
        <ExploreCard
          key={item.id}
          item={item}
          onOpen={onOpen}
          onRemix={onRemix}
        />
      ))}
      {loadingMore
        ? LOAD_MORE_PLACEHOLDERS.map((h, i) => (
            <Skeleton
              key={`more-skel-${i}`}
              className="joy-explore-more-skel"
              style={{ height: h }}
              aria-hidden
            />
          ))
        : null}
    </Masonry>
  );
}
