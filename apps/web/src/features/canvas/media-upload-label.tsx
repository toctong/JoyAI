"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import type { CanvasNode } from "@joyai/shared";
import { LoadingAnimation } from "@/components/loading-animation";
import { cn } from "@/shared/lib/utils";
import { uploadFileIntoNode } from "./lib/upload-to-node";
import { CanvasIconClose } from "./icons/canvas-icons";

type Kind = "image" | "video" | "panorama" | "audio";

const ACCEPT: Record<Kind, string> = {
  image: "image/*",
  video: "video/*",
  panorama: "image/*",
  audio: "audio/*",
};

const LABEL: Record<Kind, string> = {
  image: "上传图片",
  video: "上传视频",
  panorama: "上传素材 · 2:1",
  audio: "上传音频",
};

const HINT: Record<Kind, string> = {
  image: "尝试上传或生成图片",
  video: "尝试上传或生成视频",
  panorama: "上传 2:1 环视素材，或从下方生成",
  audio: "尝试上传或生成音频",
};

type Props = {
  nodeId: string;
  kind: Kind;
  className?: string;
  children: React.ReactNode;
};

/** Centered loading surface while a media node is uploading or separating. */
export function MediaBusyState({
  label = "上传中…",
  className,
  overlay = false,
  onCancel,
}: {
  label?: string;
  className?: string;
  /** Cover existing media during replace uploads. */
  overlay?: boolean;
  /** Show interrupt control while a generation job is running. */
  onCancel?: () => void;
}) {
  return (
    <div
      className={cn(
        "joy-media-busy",
        overlay && "is-overlay absolute inset-0 z-[2]",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <LoadingAnimation />
      <div className="joy-media-busy-core">
        <span className="joy-media-busy-label">{label}</span>
        {onCancel ? (
          <button
            type="button"
            className="joy-media-busy-cancel"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCancel();
            }}
          >
            <CanvasIconClose className="size-3" />
            中断
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function mediaBusyLabel(
  data: Record<string, unknown>,
  fallback = "生成中…",
) {
  const label = String(data.busyLabel ?? "").trim();
  return label || fallback;
}

/**
 * Empty-state upload. Soft type icon + hint; pill CTA uses theme primary.
 * Only the button opens the file picker — the rest of the node stays draggable.
 */
export function MediaUploadLabel({
  nodeId,
  kind,
  className,
  children,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 px-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="joy-media-empty-icon pointer-events-none text-muted-foreground"
      >
        {children}
      </span>
      <p className="pointer-events-none max-w-[14rem] text-center text-[12px] leading-snug text-muted-foreground">
        {HINT[kind]}
      </p>
      <button
        type="button"
        title={LABEL[kind]}
        aria-label={LABEL[kind]}
        className={cn(
          "joy-media-upload-btn inline-flex max-w-full items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium",
          "bg-primary text-primary-foreground shadow-sm",
          "hover:opacity-90 active:opacity-80",
        )}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}
      >
        <Upload className="size-4 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 truncate">{LABEL[kind]}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[kind]}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFileIntoNode(nodeId, file).catch(() => undefined);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function mediaAcceptFor(node: CanvasNode) {
  if (node.type === "video") return "video/*";
  if (node.type === "audio") return "audio/*";
  return "image/*";
}
