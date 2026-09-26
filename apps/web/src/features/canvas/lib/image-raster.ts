/** Local image crop / split. Output is a PNG blob for Asset upload — never written into the snapshot. */

import { loadCanvasImage } from "./load-canvas-image";

export type CropNorm = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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

export async function cropImageToPiece(
  src: string,
  crop: CropNorm,
  opts?: { flipH?: boolean; flipV?: boolean; rotate?: 0 | 90 | 180 | 270 },
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
  let canvas = drawRegion(image, sx, sy, sw, sh, sw, sh);
  if (opts?.flipH || opts?.flipV) {
    const flipped = document.createElement("canvas");
    flipped.width = canvas.width;
    flipped.height = canvas.height;
    const ctx = flipped.getContext("2d");
    if (!ctx) throw new Error("无法镜像裁切结果");
    ctx.translate(
      opts.flipH ? flipped.width : 0,
      opts.flipV ? flipped.height : 0,
    );
    ctx.scale(opts.flipH ? -1 : 1, opts.flipV ? -1 : 1);
    ctx.drawImage(canvas, 0, 0);
    canvas = flipped;
  }
  const rotate = opts?.rotate ?? 0;
  if (rotate === 90 || rotate === 180 || rotate === 270) {
    const rotated = document.createElement("canvas");
    const swap = rotate === 90 || rotate === 270;
    rotated.width = swap ? canvas.height : canvas.width;
    rotated.height = swap ? canvas.width : canvas.height;
    const ctx = rotated.getContext("2d");
    if (!ctx) throw new Error("无法旋转裁切结果");
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    canvas = rotated;
  }
  return pieceFromCanvas(canvas, {
    row: 0,
    col: 0,
    name: "framerally-crop.png",
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
      const canvas = drawRegion(image, sx, sy, sw, sh, sw, sh);
      pieces.push(
        await pieceFromCanvas(canvas, {
          row,
          col,
          name: `framerally-split-${row + 1}-${col + 1}.png`,
          title: `切图 ${row + 1}-${col + 1}`,
        }),
      );
    }
  }
  return pieces;
}

function drawRegion(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, dw);
  canvas.height = Math.max(1, dh);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法绘制图片");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
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
