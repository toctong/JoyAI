/** Composite a colored mask onto the source image. Output is a PNG blob, never stored in the snapshot. */

import { loadCanvasImage } from "./load-canvas-image";

const DEFAULT_MASK_FILL = "rgba(168, 85, 247, 0.45)";

export async function buildMarkedImageBlob(
  src: string,
  mask: HTMLCanvasElement,
  options?: { maskFill?: string },
): Promise<Blob> {
  const image = await loadCanvasImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法绘制标记图");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.fillStyle = options?.maskFill ?? DEFAULT_MASK_FILL;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = "destination-over";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法导出标记图（可能被跨域限制）"));
    }, "image/png");
  });
}

export function canvasHasPaint(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context || canvas.width < 1 || canvas.height < 1) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(4, Math.floor(Math.max(canvas.width, canvas.height) / 200));
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      if (data[(y * canvas.width + x) * 4 + 3]! > 0) return true;
    }
  }
  return false;
}

/** Dilate binary-ish alpha mask by ~radiusPx (covers object edges / shadows). */
export function dilateMask(
  mask: HTMLCanvasElement,
  radiusPx: number,
): HTMLCanvasElement {
  if (radiusPx <= 0) return mask;
  const out = document.createElement("canvas");
  out.width = mask.width;
  out.height = mask.height;
  const ctx = out.getContext("2d");
  if (!ctx) return mask;
  const steps = Math.max(12, Math.ceil(radiusPx * 2.5));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(mask, Math.cos(a) * radiusPx, Math.sin(a) * radiusPx);
  }
  ctx.drawImage(mask, 0, 0);
  return out;
}

/** Fraction of pixels with alpha > 0 (0–100). Samples for large canvases. */
export function maskCoveragePercent(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext("2d");
  if (!context || canvas.width < 1 || canvas.height < 1) return 0;
  const { width, height } = canvas;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 320));
  const data = context.getImageData(0, 0, width, height).data;
  let painted = 0;
  let samples = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      samples += 1;
      if (data[(y * width + x) * 4 + 3]! > 0) painted += 1;
    }
  }
  return samples ? (painted / samples) * 100 : 0;
}
