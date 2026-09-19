"use client";

import { useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import {
  CanvasIconAudio,
  CanvasIconDirector,
  CanvasIconFolder,
  CanvasIconImage,
  CanvasIconText,
  CanvasIconUpload,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { uploadFileToNewNode } from "./lib/upload-to-node";
import { cn } from "@/shared/lib/utils";

type Props = {
  onAddNode: (type: CanvasNodeType) => void;
  onOpenAssets?: () => void;
};

const TOOLS: {
  id: string;
  label: string;
  title: string;
  beta?: boolean;
  Icon: (p: { className?: string }) => React.ReactNode;
  run: (ctx: {
    onAddNode: (type: CanvasNodeType) => void;
    openUpload: () => void;
    onOpenAssets?: () => void;
  }) => void;
}[] = [
  {
    id: "text",
    label: "文本",
    title: "文本",
    Icon: CanvasIconText,
    run: ({ onAddNode }) => onAddNode("text"),
  },
  {
    id: "image",
    label: "图片",
    title: "图片",
    Icon: CanvasIconImage,
    run: ({ onAddNode }) => onAddNode("image"),
  },
  {
    id: "video",
    label: "视频",
    title: "视频",
    Icon: CanvasIconVideo,
    run: ({ onAddNode }) => onAddNode("video"),
  },
  {
    id: "audio",
    label: "音频",
    title: "音频",
    Icon: CanvasIconAudio,
    run: ({ onAddNode }) => onAddNode("audio"),
  },
  {
    id: "director",
    label: "导演台",
    title: "导演台",
    beta: true,
    Icon: CanvasIconDirector,
    run: ({ onAddNode }) => onAddNode("director"),
  },
  {
    id: "assets",
    label: "资产库",
    title: "资产库",
    Icon: CanvasIconFolder,
    run: ({ onOpenAssets }) => onOpenAssets?.(),
  },
  {
    id: "upload",
    label: "上传",
    title: "上传",
    Icon: CanvasIconUpload,
    run: ({ openUpload }) => openUpload(),
  },
];

const PRIMARY = TOOLS.filter((tool) => tool.id !== "assets" && tool.id !== "upload");
const SECONDARY = TOOLS.filter((tool) => tool.id === "assets" || tool.id === "upload");

/**
 * Left create rail — narrow icon pill.
 * Hover reveals labels beside the icons, not by widening the chrome card.
 */
export function CanvasCreateRail({ onAddNode, onOpenAssets }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);

  function runTool(tool: (typeof TOOLS)[number]) {
    tool.run({
      onAddNode,
      onOpenAssets,
      openUpload: () => fileRef.current?.click(),
    });
  }

  function renderTool(tool: (typeof TOOLS)[number]) {
    return (
      <div key={tool.id} className="relative flex h-9 items-center">
        <button
          type="button"
          title={labelsOpen ? undefined : tool.title}
          aria-label={tool.title}
          onClick={() => runTool(tool)}
          className="joy-canvas-chrome-btn relative grid size-9 place-items-center rounded-xl"
        >
          <tool.Icon className="size-4 shrink-0 opacity-90" />
          {tool.beta ? (
            <span className="absolute -right-1 -top-1 rounded bg-sky-500 px-1 py-[1px] text-[8px] font-semibold leading-none text-white">
              Beta
            </span>
          ) : null}
        </button>
        <button
          type="button"
          tabIndex={labelsOpen ? 0 : -1}
          aria-hidden={!labelsOpen}
          onClick={() => runTool(tool)}
          className={cn(
            "absolute left-full ml-4 whitespace-nowrap text-[13px] font-medium text-muted-foreground transition-[opacity,transform] duration-200 ease-out hover:text-foreground",
            labelsOpen
              ? "translate-x-0 opacity-100"
              : "pointer-events-none -translate-x-2 opacity-0",
          )}
        >
          {tool.label}
        </button>
      </div>
    );
  }

  return (
    <div
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="pointer-events-none absolute left-5 top-1/2 z-20 -translate-y-1/2"
    >
      <div
        className={cn(
          "pointer-events-auto transition-[padding] duration-200",
          labelsOpen ? "pr-16" : "pr-0",
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={() => setLabelsOpen(true)}
        onMouseLeave={() => setLabelsOpen(false)}
      >
        <div className="joy-canvas-chrome flex w-12 flex-col gap-0.5 rounded-2xl p-1.5">
          {PRIMARY.map(renderTool)}
          <div className="joy-canvas-chrome-sep mx-1.5 my-1 h-px" />
          {SECONDARY.map(renderTool)}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFileToNewNode(file).catch(() => undefined);
          e.target.value = "";
        }}
      />
    </div>
  );
}
