export const CANVAS_GRID = 24;

export function snapCoord(value: number, grid = CANVAS_GRID) {
  return Math.round(value / grid) * grid;
}

export function snapPoint(
  x: number,
  y: number,
  grid = CANVAS_GRID,
): { x: number; y: number } {
  return { x: snapCoord(x, grid), y: snapCoord(y, grid) };
}

export const SNAP_STORAGE_KEY = "joyai.canvas.snapToGrid";

export function readSnapPreference(fallback = true) {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(SNAP_STORAGE_KEY);
  if (raw === null) return fallback;
  return raw !== "0";
}

export function writeSnapPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SNAP_STORAGE_KEY, enabled ? "1" : "0");
}
