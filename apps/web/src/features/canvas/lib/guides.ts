import type { CanvasNode } from "@joyai/shared";
import { nodeBox } from "./node-box";
import { selectionBounds } from "./align";

/** World-px distance to stick to another node's edge / center. */
export const GUIDE_THRESHOLD = 6;

export type GuideLine = {
  orientation: "v" | "h";
  /** World X (vertical) or Y (horizontal) of the guide. */
  at: number;
  /** Span along the perpendicular axis. */
  from: number;
  to: number;
};

type Box = { x: number; y: number; w: number; h: number };

function toBox(node: CanvasNode): Box {
  const b = nodeBox(node);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

function xAnchors(b: Box) {
  return [b.x, b.x + b.w / 2, b.x + b.w];
}

function yAnchors(b: Box) {
  return [b.y, b.y + b.h / 2, b.y + b.h];
}

type AxisHit = {
  delta: number;
  at: number;
  spans: Array<{ from: number; to: number }>;
};

function pickAxis(
  movers: Box[],
  targets: Box[],
  threshold: number,
  axis: "x" | "y",
): AxisHit | null {
  const moveAnchors = axis === "x" ? xAnchors : yAnchors;
  const spanOf = (b: Box) =>
    axis === "x"
      ? { from: b.y, to: b.y + b.h }
      : { from: b.x, to: b.x + b.w };

  let best: AxisHit | null = null;

  for (const m of movers) {
    for (const mv of moveAnchors(m)) {
      for (const t of targets) {
        for (const tv of moveAnchors(t)) {
          const delta = tv - mv;
          const ad = Math.abs(delta);
          if (ad > threshold) continue;

          const spanM = spanOf(m);
          const spanT = spanOf(t);
          const span = {
            from: Math.min(spanM.from, spanT.from),
            to: Math.max(spanM.to, spanT.to),
          };

          if (!best || ad < Math.abs(best.delta) - 1e-6) {
            best = { delta, at: tv, spans: [span] };
            continue;
          }
          if (
            Math.abs(ad - Math.abs(best.delta)) < 1e-6 &&
            Math.abs(delta - best.delta) < 1e-6 &&
            Math.abs(tv - best.at) < 1e-6
          ) {
            best.spans.push(span);
          }
        }
      }
    }
  }

  return best;
}

function mergeSpans(spans: Array<{ from: number; to: number }>) {
  if (!spans.length) return [] as Array<{ from: number; to: number }>;
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const out: Array<{ from: number; to: number }> = [];
  let cur = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i]!;
    if (next.from <= cur.to + 0.5) {
      cur.to = Math.max(cur.to, next.to);
    } else {
      out.push(cur);
      cur = { ...next };
    }
  }
  out.push(cur);
  return out;
}

/**
 * Snap a moving selection (shared dx/dy) to nearby node edges / centers.
 * Returns adjustments to apply on top of the proposed positions, plus guide lines.
 */
export function computeGuideSnap(args: {
  moving: CanvasNode[];
  others: CanvasNode[];
  threshold?: number;
}): { dx: number; dy: number; lines: GuideLine[] } {
  const threshold = args.threshold ?? GUIDE_THRESHOLD;
  if (!args.moving.length || !args.others.length) {
    return { dx: 0, dy: 0, lines: [] };
  }

  const movers: Box[] = args.moving.map(toBox);
  const bounds = selectionBounds(args.moving);
  if (bounds && args.moving.length > 1) {
    movers.push({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
  }
  const targets = args.others.map(toBox);

  const hitX = pickAxis(movers, targets, threshold, "x");
  const hitY = pickAxis(movers, targets, threshold, "y");
  const dx = hitX?.delta ?? 0;
  const dy = hitY?.delta ?? 0;

  const lines: GuideLine[] = [];

  if (hitX) {
    // Recompute spans with snapped mover positions for cleaner line extent.
    const snapped = movers.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy }));
    const refined = pickAxis(snapped, targets, 0.51, "x");
    const spans = mergeSpans(refined?.spans ?? hitX.spans);
    for (const s of spans) {
      if (s.to - s.from < 0.5) continue;
      lines.push({
        orientation: "v",
        at: hitX.at,
        from: s.from,
        to: s.to,
      });
    }
  }

  if (hitY) {
    const snapped = movers.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy }));
    const refined = pickAxis(snapped, targets, 0.51, "y");
    const spans = mergeSpans(refined?.spans ?? hitY.spans);
    for (const s of spans) {
      if (s.to - s.from < 0.5) continue;
      lines.push({
        orientation: "h",
        at: hitY.at,
        from: s.from,
        to: s.to,
      });
    }
  }

  return { dx, dy, lines };
}
