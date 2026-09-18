/** Local image crop / split / upscale. Output is a PNG blob for Asset upload — never written into the snapshot. */

import { loadCanvasImage } from "./load-canvas-image";

export type CropNorm = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UpscaleAlgo = "high" | "bilinear" | "nearest";

export const MAX_UPSCALE_LONG_EDGE = 4096;

export const UPSCALE_TARGETS = [1024, 2048, 4096] as const;

export type RasterPiece = {
  blob: Blob;
  row: number;
  col: number;
  name: string;
  pixelWidth: number;
  pixelHeight: number;
  title: string;
};

export function readImageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片尺寸"));
    image.src = src;
  });
}

export function resolveUpscaleSize(
  width: number,
  height: number,
  targetLongEdge: number,
) {
  const longEdge = Math.max(1, width, height);
  const target = Math.min(
    MAX_UPSCALE_LONG_EDGE,
    Math.max(1, Math.round(targetLongEdge)),
  );
  const scale = target / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function cropImageToPiece(
  src: string,
  crop: CropNorm,
): Promise<RasterPiece> {
  const image = await loadDrawable(src);
  const sx = clampInt(Math.floor(crop.x * image.width), 0, image.width - 1);
  const sy = clampInt(Math.floor(crop.y * image.height), 0, image.height - 1);
  const sw = clampInt(
    Math.round(crop.width * image.width),
    1,
    image.width - sx,
  );
  const sh = clampInt(
    Math.round(crop.height * image.height),
    1,
    image.height - sy,
  );
  const canvas = drawRegion(image, sx, sy, sw, sh, sw, sh, "high");
  return pieceFromCanvas(canvas, {
    row: 0,
    col: 0,
    name: "joyai-crop.png",
    title: "裁剪",
  });
}

export async function splitImageToPieces(
  src: string,
  rows: number,
  cols: number,
): Promise<RasterPiece[]> {
  const image = await loadDrawable(src);
  const rowCount = clampInt(Math.round(rows), 1, 6);
  const colCount = clampInt(Math.round(cols), 1, 6);
  if (rowCount * colCount < 2) {
    throw new Error("至少切成 2 块");
  }
  const pieces: RasterPiece[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const sx = Math.floor((col * image.width) / colCount);
      const sy = Math.floor((row * image.height) / rowCount);
      const ex = Math.floor(((col + 1) * image.width) / colCount);
      const ey = Math.floor(((row + 1) * image.height) / rowCount);
      const sw = Math.max(1, ex - sx);
      const sh = Math.max(1, ey - sy);
      const canvas = drawRegion(image, sx, sy, sw, sh, sw, sh, "high");
      pieces.push(
        await pieceFromCanvas(canvas, {
          row,
          col,
          name: `joyai-split-${row + 1}-${col + 1}.png`,
          title: `切图 ${row + 1}-${col + 1}`,
        }),
      );
    }
  }
  return pieces;
}

export async function upscaleImageToPiece(
  src: string,
  targetLongEdge: number,
  algo: UpscaleAlgo,
): Promise<RasterPiece> {
  const image = await loadDrawable(src);
  const size = resolveUpscaleSize(
    image.width,
    image.height,
    targetLongEdge,
  );
  if (size.width <= image.width && size.height <= image.height) {
    throw new Error("图片已达到目标尺寸");
  }
  const canvas =
    algo === "high"
      ? stepUpscale(image, size.width, size.height)
      : drawRegion(
          image,
          0,
          0,
          image.width,
          image.height,
          size.width,
          size.height,
          algo,
        );
  const label = targetLongEdge >= 4096 ? "4K" : targetLongEdge >= 2048 ? "2K" : "1K";
  return pieceFromCanvas(canvas, {
    row: 0,
    col: 0,
    name: `joyai-upscale-${label}.png`,
    title: `放大 ${label}`,
  });
}

function stepUpscale(
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  let source: CanvasImageSource = image;
  let sw = image.width;
  let sh = image.height;
  while (sw * 2 <= width && sh * 2 <= height) {
    const next = drawRegion(source, 0, 0, sw, sh, sw * 2, sh * 2, "high");
    source = next;
    sw *= 2;
    sh *= 2;
  }
  return drawRegion(source, 0, 0, sw, sh, width, height, "high");
}

function drawRegion(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  algo: UpscaleAlgo,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, dw);
  canvas.height = Math.max(1, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法绘制图片");
  ctx.imageSmoothingEnabled = algo !== "nearest";
  ctx.imageSmoothingQuality = algo === "bilinear" ? "medium" : "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function pieceFromCanvas(
  canvas: HTMLCanvasElement,
  meta: Omit<RasterPiece, "blob" | "pixelWidth" | "pixelHeight">,
): Promise<RasterPiece> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("无法导出图片（可能被跨域限制）"));
    }, "image/png");
  });
  return {
    ...meta,
    blob,
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
}

function loadDrawable(src: string) {
  return loadCanvasImage(src);
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
