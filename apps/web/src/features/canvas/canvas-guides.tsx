"use client";

import type { GuideLine } from "./lib/guides";

type Props = {
  lines: GuideLine[];
  /** Viewport zoom — keep guide stroke ~1 screen px. */
  zoom: number;
};

/** World-space alignment guides drawn inside the canvas transform. */
export function CanvasGuides({ lines, zoom }: Props) {
  if (!lines.length) return null;
  const stroke = 1 / Math.max(zoom, 0.05);

  return (
    <div className="pointer-events-none absolute inset-0 z-[35]" aria-hidden>
      {lines.map((line, i) =>
        line.orientation === "v" ? (
          <div
            key={`v-${i}-${line.at}`}
            className="joy-canvas-guide is-v"
            style={{
              left: line.at,
              top: line.from,
              height: Math.max(line.to - line.from, stroke),
              width: stroke,
            }}
          />
        ) : (
          <div
            key={`h-${i}-${line.at}`}
            className="joy-canvas-guide is-h"
            style={{
              top: line.at,
              left: line.from,
              width: Math.max(line.to - line.from, stroke),
              height: stroke,
            }}
          />
        ),
      )}
    </div>
  );
}
