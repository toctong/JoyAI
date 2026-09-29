"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

/** Default / clamp for tool detail left form panel. */
export const TOOL_SIDEBAR_DEFAULT_WIDTH = 420;
export const TOOL_SIDEBAR_MIN_WIDTH = 320;
export const TOOL_SIDEBAR_MAX_WIDTH = 640;

const STORAGE_KEY = "joyai.tools.sidebarWidth";

function clampSidebarWidth(raw: number, viewport = 0) {
  const maxByViewport =
    viewport > 0
      ? Math.min(TOOL_SIDEBAR_MAX_WIDTH, Math.floor(viewport * 0.55))
      : TOOL_SIDEBAR_MAX_WIDTH;
  const max = Math.max(TOOL_SIDEBAR_MIN_WIDTH, maxByViewport);
  return Math.min(max, Math.max(TOOL_SIDEBAR_MIN_WIDTH, Math.round(raw)));
}

export function readToolSidebarWidth(): number {
  if (typeof window === "undefined") return TOOL_SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return TOOL_SIDEBAR_DEFAULT_WIDTH;
    return clampSidebarWidth(n, window.innerWidth);
  } catch {
    return TOOL_SIDEBAR_DEFAULT_WIDTH;
  }
}

export function writeToolSidebarWidth(width: number) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      String(clampSidebarWidth(width, window.innerWidth)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Resizable tool left sidebar width — remembered across visits.
 * Returns `onResizePointerDown` for the drag handle on the right edge.
 */
export function useToolSidebarWidth() {
  const [width, setWidth] = useState(TOOL_SIDEBAR_DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    setWidth(readToolSidebarWidth());
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = clampSidebarWidth(
        drag.startWidth + (event.clientX - drag.startX),
        window.innerWidth,
      );
      setWidth(next);
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setWidth((w) => {
        writeToolSidebarWidth(w);
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
  }, []);

  function onResizePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      startX: event.clientX,
      startWidth: width,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return { width, onResizePointerDown };
}
