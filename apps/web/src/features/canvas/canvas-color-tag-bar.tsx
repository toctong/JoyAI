"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanvasNodeType } from "@joyai/shared";
import { Crosshair } from "lucide-react";
import {
  colorTagMeta,
  nodesWithColorTag,
  usedColorTagCounts,
  type ColorTagId,
} from "./lib/color-tag";
import { nodeTitleLabel } from "./lib/node-chrome";
import { NODE_REGISTRY } from "./node-registry";
import { CanvasRefThumb } from "./canvas-ref-thumb";
import {
  CanvasHoverPreview,
  type HoverPreviewPayload,
} from "./canvas-hover-preview";
import {
  CanvasIconAudio,
  CanvasIconDirector,
  CanvasIconImage,
  CanvasIconPanorama,
  CanvasIconPrompt,
  CanvasIconText,
  CanvasIconVideo,
} from "./icons/canvas-icons";
import { useColorTagFocusStore } from "./color-tag-focus-store";
import { useCanvasStore } from "./store";
import { cn } from "@/shared/lib/utils";

type IconComp = (props: { className?: string }) => React.ReactNode;

const TYPE_ICON: Record<CanvasNodeType, IconComp> = {
  text: CanvasIconText,
  image: CanvasIconImage,
  video: CanvasIconVideo,
  prompt: CanvasIconPrompt,
  panorama: CanvasIconPanorama,
  audio: CanvasIconAudio,
  director: CanvasIconDirector,
};

/**
 * Top-bar color tags: stacked when idle, expand on hover.
 * Click highlights matching borders and opens a node list (same row behavior
 * as search / history). Clicking outside clears the highlight and closes it.
 */
export function CanvasColorTagBar({
  onFocusNode,
}: {
  onFocusNode: (id: string) => void;
}) {
  const nodes = useCanvasStore((s) => s.nodes);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const used = useMemo(() => usedColorTagCounts(nodes), [nodes]);
  const focusedTag = useColorTagFocusStore((s) => s.focusedTag);
  const toggle = useColorTagFocusStore((s) => s.toggle);
  const clear = useColorTagFocusStore((s) => s.clear);
  const [expanded, setExpanded] = useState(false);
  const [hoverId, setHoverId] = useState<ColorTagId | null>(null);
  const [preview, setPreview] = useState<HoverPreviewPayload | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const members = useMemo(
    () => (focusedTag ? nodesWithColorTag(nodes, focusedTag) : []),
    [focusedTag, nodes],
  );

  useEffect(() => {
    if (focusedTag && !used.some((item) => item.id === focusedTag)) {
      clear();
    }
  }, [clear, focusedTag, used]);

  useEffect(() => {
    setPreview(null);
  }, [focusedTag]);

  useEffect(() => {
    if (!focusedTag) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (rootRef.current?.contains(target)) return;
      clear();
      setExpanded(false);
      setHoverId(null);
      setPreview(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [clear, focusedTag]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  if (!used.length) return null;

  function clearLeaveTimer() {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }

  function onEnterBar() {
    clearLeaveTimer();
    setExpanded(true);
  }

  function onLeaveBar() {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => {
      setExpanded(false);
      setHoverId(null);
    }, 140);
  }

  const showExpanded = expanded || Boolean(focusedTag);
  const meta = focusedTag ? colorTagMeta(focusedTag) : null;

  return (
    <div
      ref={rootRef}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      data-canvas-color-tag
      className="relative"
      onPointerEnter={onEnterBar}
      onPointerLeave={onLeaveBar}
    >
      <div
        className={cn(
          "joy-canvas-chrome inline-flex h-8 items-center rounded-xl transition-[padding] duration-150",
          showExpanded ? "gap-0.5 px-1" : "px-2",
        )}
      >
        {showExpanded
          ? used.map((item) => {
              const hovered = hoverId === item.id;
              const active = focusedTag === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={`${item.label}高亮`}
                  aria-pressed={active}
                  aria-expanded={active}
                  onPointerEnter={() => setHoverId(item.id)}
                  onPointerLeave={() =>
                    setHoverId((id) => (id === item.id ? null : id))
                  }
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "relative grid size-7 place-items-center rounded-lg transition",
                    (hovered || active) && "bg-muted",
                  )}
                >
                  <span
                    className="size-3.5 rounded-full shadow-sm ring-2 ring-popover"
                    style={{ background: item.swatch }}
                  />
                  {hovered && !focusedTag ? (
                    <span className="joy-canvas-chrome pointer-events-none absolute left-1/2 top-[calc(100%+6px)] z-[90] -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium text-popover-foreground shadow-md">
                      {item.label}
                    </span>
                  ) : null}
                </button>
              );
            })
          : (
            <span className="flex items-center pl-0.5" aria-hidden>
              {used.map((item, index) => (
                <span
                  key={item.id}
                  className={cn(
                    "relative size-4 rounded-full shadow-sm ring-2 ring-popover",
                    index > 0 && "-ml-1.5",
                  )}
                  style={{
                    background: item.swatch,
                    zIndex: index + 1,
                  }}
                />
              ))}
            </span>
          )}
      </div>

      {meta ? (
        <div className="joy-canvas-chrome absolute right-0 top-[calc(100%+8px)] z-[80] flex w-[280px] flex-col overflow-visible rounded-2xl border border-border shadow-lg">
          <CanvasHoverPreview preview={preview} className="top-0" />
          <div className="flex items-center gap-2 px-3.5 pb-1 pt-3">
            <span
              className="size-3 shrink-0 rounded-full ring-2 ring-popover"
              style={{ background: meta.swatch }}
            />
            <span className="text-sm font-semibold">{meta.label}</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {members.length}
            </span>
          </div>
          <div
            className="max-h-[320px] overflow-y-auto overflow-x-hidden rounded-b-2xl px-2 pb-2"
            onPointerLeave={() => setPreview(null)}
          >
            {members.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                暂无该颜色节点
              </p>
            ) : (
              <div className="space-y-0.5">
                {members.map((node, index) => {
                  const Icon = TYPE_ICON[node.type];
                  const url = String(node.data.url ?? "");
                  const title = nodeTitleLabel(node.type, node.data);
                  const subtitle = NODE_REGISTRY[node.type].label.replace(
                    "图像",
                    "图片",
                  );
                  const active = selected.has(node.id);
                  const showThumb =
                    (node.type === "image" ||
                      node.type === "panorama" ||
                      node.type === "video") &&
                    Boolean(url) &&
                    !url.startsWith("data:");
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onFocusNode(node.id)}
                      onPointerEnter={() =>
                        setPreview({
                          kind:
                            node.type === "video"
                              ? "video"
                              : node.type === "audio"
                                ? "audio"
                                : node.type === "image" ||
                                    node.type === "panorama"
                                  ? "image"
                                  : "other",
                          url: showThumb ? url : undefined,
                        })
                      }
                      onPointerLeave={() => setPreview(null)}
                      className={cn(
                        "group/row flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition",
                        active ? "bg-muted" : "hover:bg-muted/60",
                      )}
                    >
                      <span className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                        <span className="absolute left-1 top-0.5 z-[1] text-[9px] font-medium text-muted-foreground">
                          {index + 1}
                        </span>
                        {showThumb ? (
                          <CanvasRefThumb kind={node.type} url={url} />
                        ) : (
                          <Icon className="size-4 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {subtitle}
                        </span>
                      </span>
                      <Crosshair className="size-3.5 shrink-0 text-muted-foreground opacity-50 transition group-hover/row:opacity-90" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
