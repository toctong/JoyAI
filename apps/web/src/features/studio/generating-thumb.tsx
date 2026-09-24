"use client";

import type { CSSProperties } from "react";
import { LoadingAnimation } from "@/components/loading-animation";
import { cn } from "@/shared/lib/utils";
import "./generating-thumb.css";

type Props = {
  aspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  /** Show looping mesh (animated webp/gif). Default on. */
  useVideo?: boolean;
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
  useVideo = true,
}: Props) {
  const rawWidth = style && typeof style === "object" ? style.width : undefined;
  const widthVar =
    typeof rawWidth === "number"
      ? `${rawWidth}px`
      : typeof rawWidth === "string"
        ? rawWidth
        : undefined;

  return (
    <div
      className={cn("joy-gen-thumb", className)}
      style={{
        aspectRatio,
        ...style,
        ...(widthVar
          ? ({ ["--joy-gen-thumb-w"]: widthVar } as CSSProperties)
          : null),
      }}
      aria-busy
      aria-label="造梦中"
    >
      <div className="joy-gen-thumb-fall" aria-hidden />
      {useVideo ? (
        <div className="joy-gen-thumb-media">
          <LoadingAnimation />
        </div>
      ) : null}
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

type FailedThumbProps = {
  aspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  error?: string | null;
};

/** Same footprint as GeneratingThumb — one failed slot in a multi-n grid. */
export function FailedThumb({
  aspectRatio = "1 / 1",
  className,
  style,
  error,
}: FailedThumbProps) {
  const rawWidth = style && typeof style === "object" ? style.width : undefined;
  const widthVar =
    typeof rawWidth === "number"
      ? `${rawWidth}px`
      : typeof rawWidth === "string"
        ? rawWidth
        : undefined;
  const message = String(error || "生成失败").trim() || "生成失败";

  return (
    <div
      className={cn("joy-gen-thumb is-failed", className)}
      style={{
        aspectRatio,
        ...style,
        ...(widthVar
          ? ({ ["--joy-gen-thumb-w"]: widthVar } as CSSProperties)
          : null),
      }}
      role="img"
      aria-label={`生成失败：${message}`}
      title={message}
    >
      <div className="joy-gen-thumb-fail-bg" aria-hidden />
      <div className="joy-gen-thumb-fail-art" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/gen-failed.svg"
          alt=""
          className="joy-gen-thumb-fail-illust"
          draggable={false}
        />
      </div>
      <div className="joy-gen-thumb-badge is-fail">生成失败</div>
      <p className="joy-gen-thumb-fail-msg">{message}</p>
    </div>
  );
}
