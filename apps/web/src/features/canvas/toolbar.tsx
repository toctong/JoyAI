"use client";

import { useRef, type ComponentType } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import { useCanvasStore } from "./store";
import { NODE_TYPE_LIST } from "./node-registry";
import {
  CanvasIconImage,
  CanvasIconPrompt,
  CanvasIconText,
  CanvasIconUpload,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { apiUpload } from "@/shared/lib/api";
import { cn } from "@/shared/lib/utils";

const ICONS: Record<
  CanvasNodeType,
  ComponentType<{ className?: string; title?: string }>
> = {
  text: CanvasIconText,
  image: CanvasIconImage,
  video: CanvasIconVideo,
  prompt: CanvasIconPrompt,
};

const tools = NODE_TYPE_LIST.map((t) => ({
  ...t,
  icon: ICONS[t.type],
}));

export function CanvasToolbar({ className }: { className?: string }) {
  const addNode = useCanvasStore((s) => s.addNode);
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const pushHistory = useCanvasStore((s) => s.pushHistory);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onUpload(file: File) {
    pushHistory();
    const asset = await apiUpload<{ id: string; url: string; kind: string }>(
      "/upload",
      file,
    );
    const type: CanvasNodeType = asset.kind === "video" ? "video" : "image";
    const id = addNode(type);
    updateNodeData(id, { url: asset.url, assetId: asset.id });
  }

  return (
    <div
      className={cn(
        "absolute left-3.5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1.5 rounded-[22px] bg-[#1a1a1ae6] p-2 shadow-[0_8px_28px_rgba(0,0,0,0.35)] backdrop-blur-[14px]",
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.type}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onClick={() => {
              pushHistory();
              addNode(tool.type);
            }}
            className="grid size-10 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            <Icon className="size-[19px]" />
          </button>
        );
      })}
      <span className="mx-auto my-0.5 h-px w-6 bg-white/10" aria-hidden />
      <button
        type="button"
        title="上传"
        aria-label="上传"
        onClick={() => fileRef.current?.click()}
        className="grid size-10 place-items-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white"
      >
        <CanvasIconUpload className="size-[19px]" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onUpload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
