"use client";

import { Skeleton } from "@/components/ui/skeleton";
import "./explore-skeleton.css";

const FEED_HEIGHTS = [220, 280, 240, 320, 200, 300, 260, 340, 230, 290, 250, 310];

export function ExploreFeedSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="joy-explore-skel-feed"
      aria-busy="true"
      aria-label="加载灵感中"
    >
      {FEED_HEIGHTS.slice(0, count).map((h, i) => (
        <Skeleton
          key={i}
          className="joy-explore-skel-card"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export function ExploreDialogSkeleton() {
  return (
    <div
      className="joy-explore-dialog-inner joy-explore-dialog-skel"
      aria-busy="true"
      aria-label="加载作品详情"
    >
      <div className="joy-explore-dialog-media">
        <Skeleton className="joy-explore-dialog-skel-media" />
      </div>
      <aside className="joy-explore-dialog-side">
        <div className="joy-explore-dialog-side-top">
          <div className="joy-explore-dialog-user">
            <Skeleton className="joy-explore-dialog-skel-avatar" />
            <Skeleton className="joy-explore-dialog-skel-name" />
          </div>
          <Skeleton className="joy-explore-dialog-skel-like" />
        </div>
        <Skeleton className="joy-explore-dialog-skel-model" />
        <div className="joy-explore-dialog-prompt-head">
          <Skeleton className="joy-explore-dialog-skel-label" />
          <Skeleton className="joy-explore-dialog-skel-copy" />
        </div>
        <div className="joy-explore-dialog-skel-prompt">
          <Skeleton className="joy-explore-dialog-skel-line" />
          <Skeleton className="joy-explore-dialog-skel-line is-mid" />
          <Skeleton className="joy-explore-dialog-skel-line is-short" />
          <Skeleton className="joy-explore-dialog-skel-line is-mid" />
        </div>
        <Skeleton className="joy-explore-dialog-skel-meta" />
        <Skeleton className="joy-explore-dialog-skel-cta" />
      </aside>
    </div>
  );
}
