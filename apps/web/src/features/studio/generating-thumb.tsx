"use client";

import { motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import "./generating-thumb.css";

type Props = {
  aspectRatio?: string;
  className?: string;
};

function statusCopy(status?: string) {
  if (status === "queued") return "已加入普通队列，等待调度";
  // `polling` is reserved for post-success mirror / late settle — not "almost done" at submit.
  if (status === "polling") return "结果回传中，即将完成";
  if (status === "running") return "视频生成中，Seedance 常需数分钟请稍候";
  return "已提交，正在准备生成";
}

export function GeneratingThumb({
  aspectRatio = "1 / 1",
  className,
}: Props) {
  return (
    <div
      className={cn("joy-gen-thumb", className)}
      style={{ aspectRatio }}
      aria-busy
      aria-label="造梦中"
    >
      <div className="joy-gen-thumb-stage" aria-hidden>
        <motion.span
          className="joy-gen-blob joy-gen-blob-a"
          animate={{
            x: ["-8%", "18%", "-4%", "-8%"],
            y: ["-6%", "12%", "20%", "-6%"],
            scale: [1, 1.18, 0.92, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="joy-gen-blob joy-gen-blob-b"
          animate={{
            x: ["12%", "-16%", "8%", "12%"],
            y: ["10%", "-8%", "16%", "10%"],
            scale: [1.05, 0.9, 1.2, 1.05],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="joy-gen-blob joy-gen-blob-c"
          animate={{
            x: ["0%", "10%", "-14%", "0%"],
            y: ["18%", "-4%", "8%", "18%"],
            scale: [0.95, 1.15, 1, 0.95],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <span className="joy-gen-thumb-veil" />
        <motion.span
          className="joy-gen-thumb-sheen"
          animate={{ x: ["-120%", "140%"] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="joy-gen-thumb-badge">造梦中</div>
    </div>
  );
}

export function GeneratingStatusBar({ status }: { status?: string }) {
  return (
    <div className="joy-gen-status">
      <span className="joy-gen-status-tag">普通队列</span>
      <span className="joy-gen-status-text">{statusCopy(status)}</span>
    </div>
  );
}
