/** Compose an expanded canvas with the source image placed inside padding. */

import { loadCanvasImage } from "./load-canvas-image";

export type OutpaintPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export async function buildOutpaintCanvasBlob(
  url: string,
  padding: OutpaintPadding,
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadCanvasImage(url);
  const width = Math.max(1, image.naturalWidth + padding.left + padding.right);
  const height = Math.max(
    1,
    image.naturalHeight + padding.top + padding.bottom,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, padding.left, padding.top);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("导出失败"))),
      "image/png",
    );
  });
  return { blob, width, height };
}

export function buildOutpaintPrompt(padding: OutpaintPadding) {
  const parts: string[] = [];
  if (padding.top > 0) parts.push(`向上扩展 ${padding.top}px`);
  if (padding.right > 0) parts.push(`向右扩展 ${padding.right}px`);
  if (padding.bottom > 0) parts.push(`向下扩展 ${padding.bottom}px`);
  if (padding.left > 0) parts.push(`向左扩展 ${padding.left}px`);
  const range = parts.length ? parts.join("，") : "四周适度扩展";
  return `扩图：保持主体与风格一致，自然延伸画面背景与环境。${range}。`;
}
