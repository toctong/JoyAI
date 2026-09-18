/** Composite a blue mask onto the source image. Output is a PNG blob, never stored in the snapshot. */

import { loadCanvasImage } from "./load-canvas-image";

const MASK_FILL = "rgba(37, 99, 235, 0.38)";

export async function buildMarkedImageBlob(
  src: string,
  mask: HTMLCanvasElement,
): Promise<Blob> {
  const image = await loadCanvasImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法绘制标记图");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.fillStyle = MASK_FILL;
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
      if (data[(y * canvas.width + x) * 4 + 3] > 0) return true;
    }
  }
  return false;
}
