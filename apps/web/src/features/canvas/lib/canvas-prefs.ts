export type CanvasGridMode = "dots" | "lines" | "blank";

const GRID_KEY = "joyai.canvas.gridMode";

export function readGridModePreference(
  fallback: CanvasGridMode = "dots",
): CanvasGridMode {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(GRID_KEY);
    if (v === "dots" || v === "lines" || v === "blank") return v;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function writeGridModePreference(mode: CanvasGridMode) {
  try {
    localStorage.setItem(GRID_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function cycleGridMode(mode: CanvasGridMode): CanvasGridMode {
  if (mode === "dots") return "lines";
  if (mode === "lines") return "blank";
  return "dots";
}

export function gridModeLabel(mode: CanvasGridMode): string {
  if (mode === "dots") return "点状网格";
  if (mode === "lines") return "线状网格";
  return "无网格";
}

/** True when event target is under chrome that must ignore zoom / board shortcuts. */
export function isCanvasOverlayTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-canvas-no-zoom]") ||
      target.closest("[data-canvas-shortcuts-ignore]"),
  );
}
