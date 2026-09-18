/** Clamp a floating menu into the board so it stays fully visible. */
export function clampMenuPosition(
  x: number,
  y: number,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  inset = 12,
) {
  const maxX = Math.max(inset, viewport.width - size.width - inset);
  const maxY = Math.max(inset, viewport.height - size.height - inset);
  return {
    x: Math.min(Math.max(inset, x), maxX),
    y: Math.min(Math.max(inset, y), maxY),
  };
}
