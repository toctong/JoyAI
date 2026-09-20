"use client";

import type { CSSProperties } from "react";
import { LoadingAnimation } from "@/components/loading-animation";
import { cn } from "@/shared/lib/utils";
import "./generating-thumb.css";

type Props = {
  aspectRatio?: string;
  className?: string;
  style?: CSSProperties;
};

function statusCopy(status?: string, kind?: "image" | "video") {
  if (status === "queued") return "已加入普通队列，等待调度";
  // `polling` is reserved for post-success mirror / late settle — not "almost done" at submit.
  if (status === "polling") return "结果回传中，即将完成";
  if (status === "running") {
    return kind === "video"
      ? "视频生成中，常需数分钟请稍候"
      : "图片生成中，请稍候";
  }
  return "已提交，正在准备生成";
}

export function GeneratingThumb({
  aspectRatio = "1 / 1",
  className,
  style,
}: Props) {
  return (
    <div
      className={cn("joy-gen-thumb", className)}
      style={{ aspectRatio, ...style }}
      aria-busy
      aria-label="造梦中"
    >
      <LoadingAnimation />

      <div className="joy-gen-thumb-badge">造梦中</div>
    </div>
  );
}

export function GeneratingStatusBar({
  status,
  kind,
}: {
  status?: string;
  kind?: "image" | "video";
}) {
  return (
    <div className="joy-gen-status">
      <span className="joy-gen-status-tag">普通队列</span>
      <span className="joy-gen-status-text">{statusCopy(status, kind)}</span>
    </div>
  );
}
