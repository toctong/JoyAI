"use client";

import { useEffect, useRef, useState } from "react";
import type { CanvasNode } from "@joyai/shared";
import {
  useIsNodeHighlighted,
  useIsNodePulsing,
  useIsNodeSelected,
} from "../store";
import { NodeRuntimeBadge } from "../node-runtime-badge";
import { NodeTitleChip } from "../node-title-chip";
import { nodeChromeClass, nodeTitleLabel } from "../lib/node-chrome";
import { CanvasIconVideo } from "../icons/canvas-icons";
import { cn } from "@/shared/lib/utils";
import "plyr/dist/plyr.css";

type Props = {
  node: CanvasNode;
  onPointerDown: (e: React.PointerEvent) => void;
};

export function VideoNode({ node, onPointerDown }: Props) {
  const selected = useIsNodeSelected(node.id);
  const highlighted = useIsNodeHighlighted(node.id);
  const pulsing = useIsNodePulsing(node.id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hovered, setHovered] = useState(false);
  const url = String(node.data.url ?? "");
  const status = String(node.data.status ?? "idle");
  const error = String(node.data.error ?? "");
  const framed = Boolean(url) && !url.startsWith("data:");
  const title = nodeTitleLabel("video", node.data);

  useEffect(() => {
    if (!url || !videoRef.current) return;
    let player: { destroy: () => void } | null = null;
    void import("plyr").then(({ default: Plyr }) => {
      if (!videoRef.current) return;
      player = new Plyr(videoRef.current, {
        controls: ["play", "progress", "mute", "fullscreen"],
      });
    });
    return () => player?.destroy();
  }, [url]);

  return (
    <div
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "absolute cursor-grab overflow-visible rounded-md active:cursor-grabbing",
        !framed && "overflow-hidden",
        nodeChromeClass({ selected, highlighted, pulsing, framed }),
      )}
      style={{
        left: node.x,
        top: node.y,
        width: node.width ?? 280,
        height: node.height ?? 180,
      }}
    >
      <NodeTitleChip label={title} visible={selected || hovered} />
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-md",
          framed && "bg-black/5",
        )}
      >
        {url ? (
          <video
            ref={videoRef}
            src={url}
            className="h-full w-full object-cover"
            playsInline
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <CanvasIconVideo className="size-7 opacity-70" />
            <span className="text-xs">空视频节点</span>
          </div>
        )}
        <NodeRuntimeBadge status={status} error={error} />
      </div>
    </div>
  );
}
