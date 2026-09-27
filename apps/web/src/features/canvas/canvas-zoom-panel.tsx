"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

type Props = {
  open: boolean;
  zoom: number;
  width: number;
  height: number;
  onClose: () => void;
  onZoomChange: (zoom: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
};

function Row({
  label,
  keys,
  onClick,
}: {
  label: string;
  keys?: string[];
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="min-w-0 truncate">{label}</span>
      {keys?.length ? (
        <span className="flex shrink-0 items-center gap-1">
          {keys.map((key) => (
            <kbd
              key={key}
              className="inline-flex min-w-5 items-center justify-center rounded border border-border/80 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-[12px]",
    onClick
      ? "joy-canvas-chrome-btn text-foreground/90 hover:text-foreground"
      : "text-muted-foreground",
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

/** Popover above the dock zoom chip — sized by dock overlay stack. */
export function CanvasZoomPanel({
  open,
  zoom,
  width,
  height,
  onClose,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  onFit,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const zoomPct = Math.round(zoom * 100);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={rootRef}
      data-canvas-no-zoom
      data-canvas-shortcuts-ignore
      className="joy-canvas-chrome absolute bottom-[calc(100%+10px)] left-0 z-40 flex flex-col overflow-hidden rounded-2xl p-2 shadow-lg"
      style={{ width, minHeight: height }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <input
          type="range"
          min={10}
          max={400}
          step={1}
          value={Math.min(400, Math.max(10, zoomPct))}
          aria-label="缩放"
          onChange={(e) => onZoomChange(Number(e.target.value) / 100)}
          className="h-1.5 flex-1 cursor-pointer accent-foreground"
        />
        <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
          {zoomPct}%
        </span>
      </div>

      <div className="space-y-0.5">
        <Row label="缩放至 50%" onClick={() => onZoomChange(0.5)} />
        <Row label="缩放至 100%" onClick={() => onZoomChange(1)} />
        <Row label="适合内容" keys={["0"]} onClick={onFit} />
      </div>

      <div className="joy-canvas-chrome-sep mx-1 my-2 h-px" />

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        <Row label="放大" keys={["⌘", "+"]} onClick={onZoomIn} />
        <Row label="缩小" keys={["⌘", "−"]} onClick={onZoomOut} />
        <Row label="滚轮缩放" keys={["滚轮"]} />
        <Row label="平移画布" keys={["Space"]} />
        <Row label="中键平移" keys={["中键"]} />
        <Row label="适应选中" keys={["1"]} />
      </div>
    </div>
  );
}
