/** Tiny frame outline for aspect-ratio chips. */
export function AspectRatioGlyph({ ratio }: { ratio: string }) {
  const parts = ratio.split(":");
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return null;
  }
  const max = 14;
  const scale = max / Math.max(w, h);
  const width = Math.max(5, Math.round(w * scale));
  const height = Math.max(5, Math.round(h * scale));
  return (
    <span
      className="joy-composer-params-aspect-glyph"
      style={{ width, height }}
      aria-hidden
    />
  );
}
