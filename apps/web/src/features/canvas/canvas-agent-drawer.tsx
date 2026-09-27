"use client";

import { useEffect, useRef, useState } from "react";
import { CanvasIconClose } from "./icons/canvas-icons";
import { CanvasAgentPanel } from "./canvas-agent-panel";
import { useCanvasRightPanelStore } from "./right-panel-store";
import {
  AGENT_DRAWER_DEFAULT_WIDTH,
  AGENT_DRAWER_MIN_WIDTH,
  readAgentDrawerWidth,
  writeAgentDrawerWidth,
} from "./lib/canvas-prefs";
import { JOYAI_BRAND } from "@/shared/brand/joyai-brand";
import { cn } from "@/shared/lib/utils";

type Props = {
  projectId: string;
};

/**
 * Bottom-right AI entry + full-height right drawer (out of flow).
 * Left edge is draggable; width is clamped and remembered.
 */
export function CanvasAgentDrawer({ projectId }: Props) {
  const mode = useCanvasRightPanelStore((s) => s.mode);
  const toggle = useCanvasRightPanelStore((s) => s.toggle);
  const close = useCanvasRightPanelStore((s) => s.close);
  const open = mode === "agent";

  const [width, setWidth] = useState(AGENT_DRAWER_DEFAULT_WIDTH);
  const dragRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    setWidth(readAgentDrawerWidth());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const max = Math.max(
        AGENT_DRAWER_MIN_WIDTH,
        Math.min(window.innerWidth * 0.72, 720),
      );
      const next = Math.min(
        max,
        Math.max(
          AGENT_DRAWER_MIN_WIDTH,
          drag.startWidth + (drag.startX - event.clientX),
        ),
      );
      setWidth(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidth((w) => {
        writeAgentDrawerWidth(w);
        return w;
      });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [open]);

  return (
    <>
      {!open ? (
        <button
          type="button"
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          title="与 AI 对话"
          aria-label="与 AI 对话"
          onClick={() => toggle("agent")}
          className={cn(
            "joy-canvas-agent-fab pointer-events-auto absolute bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-3.5 py-2.5 text-[13px] font-medium shadow-lg transition hover:scale-[1.02] active:scale-[0.98]",
          )}
        >
          <span className="joy-canvas-agent-fab-icon grid size-6 place-items-center rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={JOYAI_BRAND.logo}
              alt=""
              className="size-4 object-contain"
              draggable={false}
            />
          </span>
          与 AI 对话
        </button>
      ) : null}

      {open ? (
        <aside
          data-canvas-no-zoom
          data-canvas-shortcuts-ignore
          className="joy-canvas-chrome pointer-events-auto fixed inset-y-0 right-0 z-40 flex h-svh flex-col overflow-hidden border-l border-border shadow-xl"
          style={{ width }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="拖动调整宽度"
            title="拖动调整宽度"
            className="joy-canvas-agent-resize absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none"
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              dragRef.current = {
                startX: event.clientX,
                startWidth: width,
              };
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
          />
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5 pl-4">
            <div className="inline-flex min-w-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={JOYAI_BRAND.logo}
                alt=""
                className="size-4 shrink-0 object-contain"
                draggable={false}
              />
              <span className="truncate text-sm font-semibold">与 AI 对话</span>
            </div>
            <button
              type="button"
              title="关闭"
              aria-label="关闭"
              onClick={close}
              className="joy-canvas-chrome-btn grid size-7 place-items-center rounded-lg"
            >
              <CanvasIconClose className="size-3.5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <CanvasAgentPanel projectId={projectId} compactHeader />
          </div>
        </aside>
      ) : null}
    </>
  );
}
