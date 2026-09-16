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

function resolveAspectRatio(item: ExploreFeedItem): string {
  if (item.width && item.height && item.width > 0 && item.height > 0) {
    return `${item.width} / ${item.height}`;
  }
  const ar = item.aspectRatio?.trim();
  if (ar) {
    if (ar.includes(":")) return ar.replace(":", " / ");
    if (ar.includes("/")) return ar;
    const n = Number(ar);
    if (Number.isFinite(n) && n > 0) return `${n} / 1`;
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
  const ar = resolveAspectRatio(item);

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
          <video
            className={cn(
              "joy-explore-media",
              loaded && "is-ready",
            )}
            src={item.mediaUrl}
            poster={item.thumbnailUrl}
            muted
            playsInline
            loop
            preload="metadata"
            onLoadedData={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            onMouseEnter={(e) => void e.currentTarget.play()}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
          />
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
