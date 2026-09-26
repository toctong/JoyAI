/**
 * Studio hover tools — run on the creation page (dialogs + jobs), not via canvas.
 */

import { api, apiUpload } from "@/shared/lib/api";
import type { CanvasSnapshot } from "@joyai/shared";
import type { ImageAngleParams } from "@/features/canvas/lib/angle-prompt";
import { buildAnglePrompt } from "@/features/canvas/lib/angle-prompt";
import { wrapPanoramaPrompt } from "@/features/canvas/lib/panorama-prompt";
import type { RasterPiece } from "@/features/canvas/lib/image-raster";
import { captureVideoFrame } from "@/features/canvas/lib/capture-video-frame";
import { separateAudioFromVideo } from "@/features/canvas/lib/extract-audio";
import { trimVideoToFile } from "@/features/canvas/lib/trim-video";

export type StudioMediaAsset = {
  id: string;
  url: string;
  kind?: string;
};

/** Tools available from studio result-card hover. */
export type StudioLocalTool =
  | "crop"
  | "split"
  | "inpaint"
  | "angle"
  | "to-panorama"
  | "capture-frame"
  | "extract-audio"
  | "trim-video";

/** @deprecated Use StudioLocalTool */
export type StudioCanvasTool = StudioLocalTool;

const NODE_W = 360;
const NODE_H = 360;

export function buildStudioAssetCanvasSnapshot(
  asset: StudioMediaAsset,
  title = "创作素材",
): CanvasSnapshot {
  const isVideo =
    asset.kind === "video" || /\.(mp4|webm|mov)(\?|$)/i.test(asset.url);
  return {
    version: 2,
    nodes: [
      {
        id: crypto.randomUUID(),
        type: isVideo ? "video" : "image",
        x: 120,
        y: 100,
        width: NODE_W,
        height: isVideo ? Math.round((NODE_W * 9) / 16) : NODE_H,
        data: {
          url: asset.url,
          assetId: asset.id,
          status: "succeeded",
          title,
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Create a canvas project with this asset (「去画布编辑」 only). */
export async function openAssetInNewCanvas(
  asset: StudioMediaAsset,
  title = "创作 · 画布编辑",
): Promise<{ id: string; href: string }> {
  const created = await api<{ id: string }>("/canvas/projects", {
    method: "POST",
    body: {
      title,
      snapshot: buildStudioAssetCanvasSnapshot(asset, title),
    },
  });
  return { id: created.id, href: `/canvas/${created.id}` };
}

async function uploadFile(file: File) {
  return apiUpload<{ id: string; url: string; kind: string }>("/upload", file);
}

async function registerLocalJob(opts: {
  kind: "image" | "video" | "audio";
  prompt: string;
  assetIds: string[];
  localTool?: string;
  layout?: { rows: number; cols: number };
  tiles?: Array<{ assetId: string; row: number; col: number }>;
  width?: number;
  height?: number;
}) {
  return api<{ id: string }>("/jobs/local", {
    method: "POST",
    body: opts,
  });
}

function layoutFromPieces(pieces: RasterPiece[]) {
  if (!pieces.length) return undefined;
  const rows = Math.max(...pieces.map((p) => p.row)) + 1;
  const cols = Math.max(...pieces.map((p) => p.col)) + 1;
  if (!(rows >= 1 && cols >= 1)) return undefined;
  return { rows, cols };
}

/** Reconstruct source pixel size from row-major split pieces. */
function sourceSizeFromPieces(pieces: RasterPiece[]) {
  const layout = layoutFromPieces(pieces);
  if (!layout) return undefined;
  const { rows, cols } = layout;
  let width = 0;
  let height = 0;
  for (let c = 0; c < cols; c += 1) {
    const piece = pieces.find((p) => p.row === 0 && p.col === c);
    if (piece?.pixelWidth) width += piece.pixelWidth;
  }
  for (let r = 0; r < rows; r += 1) {
    const piece = pieces.find((p) => p.row === r && p.col === 0);
    if (piece?.pixelHeight) height += piece.pixelHeight;
  }
  if (!(width > 0 && height > 0)) return undefined;
  return { width, height };
}

/** Upload raster pieces and register as a succeeded studio image job. */
export async function commitStudioImagePieces(
  pieces: RasterPiece[],
  label: string,
  opts?: { localTool?: string },
): Promise<{ id: string }> {
  if (!pieces.length) throw new Error("没有可提交的结果");
  // Always submit row-major so mosaic reassembly matches the source.
  const sorted = [...pieces].sort(
    (a, b) => a.row - b.row || a.col - b.col,
  );
  const uploaded = await Promise.all(
    sorted.map(async (piece) => {
      const file = new File([piece.blob], piece.name, { type: "image/png" });
      return uploadFile(file);
    }),
  );
  const layout = layoutFromPieces(sorted);
  const sourceSize = sourceSizeFromPieces(sorted);
  const tiles = sorted.map((piece, i) => ({
    assetId: uploaded[i]!.id,
    row: piece.row,
    col: piece.col,
  }));
  const localTool =
    opts?.localTool ??
    (label === "切图" ? "split" : label === "裁剪" ? "crop" : undefined);
  return registerLocalJob({
    kind: "image",
    prompt: label,
    assetIds: uploaded.map((a) => a.id),
    ...(localTool ? { localTool } : {}),
    ...(layout ? { layout } : {}),
    ...(tiles.length > 1 ? { tiles } : {}),
    ...(sourceSize ? sourceSize : {}),
  });
}

export async function submitOutpaintJob(
  asset: StudioMediaAsset,
  opts?: { prompt?: string; modelId?: string },
): Promise<{ id: string }> {
  const prompt = (opts?.prompt ?? "扩图，保持主体完整，自然延展画面").trim();
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "image",
      input: {
        prompt,
        n: 1,
        modelId: opts?.modelId,
        referenceAssetIds: asset.id ? [asset.id] : undefined,
        referenceUrls: asset.url ? [asset.url] : undefined,
        operation: "outpaint",
      },
    },
  });
}

export async function submitInpaintJob(
  _asset: StudioMediaAsset,
  marked: Blob,
  opts: { prompt: string; modelId?: string },
): Promise<{ id: string }> {
  const file = new File([marked], `mask-${Date.now()}.png`, {
    type: "image/png",
  });
  const markedAsset = await uploadFile(file);
  const prompt = opts.prompt.trim() || "局部重绘，保持整体风格一致";
  // Marked composite already includes the source + paint — only pass that as ref.
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "image",
      input: {
        prompt,
        n: 1,
        modelId: opts.modelId,
        referenceAssetIds: [markedAsset.id],
        referenceUrls: [markedAsset.url],
        operation: "inpaint",
      },
    },
  });
}

export async function submitAngleJob(
  asset: StudioMediaAsset,
  params: ImageAngleParams,
  opts?: { modelId?: string },
): Promise<{ id: string }> {
  const prompt = buildAnglePrompt(params);
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "image",
      input: {
        prompt,
        n: 1,
        modelId: opts?.modelId,
        referenceAssetIds: asset.id ? [asset.id] : undefined,
        referenceUrls: asset.url ? [asset.url] : undefined,
        operation: "generate",
      },
    },
  });
}

export async function submitPanoramaJob(
  asset: StudioMediaAsset,
  opts?: { prompt?: string; modelId?: string },
): Promise<{ id: string }> {
  const prompt = wrapPanoramaPrompt(opts?.prompt ?? "基于参考图转为可环视全景", {
    hasReference: true,
  });
  return api<{ id: string }>("/jobs", {
    method: "POST",
    body: {
      kind: "image",
      input: {
        prompt,
        n: 1,
        ratio: "2:1",
        modelId: opts?.modelId,
        referenceAssetIds: asset.id ? [asset.id] : undefined,
        referenceUrls: asset.url ? [asset.url] : undefined,
        operation: "generate",
      },
    },
  });
}

export async function captureStudioFrame(
  asset: StudioMediaAsset,
): Promise<{ id: string }> {
  const file = await captureVideoFrame(asset.url, "first", 0);
  const uploaded = await uploadFile(file);
  return registerLocalJob({
    kind: "image",
    prompt: "视频截帧",
    assetIds: [uploaded.id],
  });
}

export async function extractStudioAudio(asset: StudioMediaAsset): Promise<{
  videoJobId: string;
  audioAssetId: string;
}> {
  const { audio, silentVideo } = await separateAudioFromVideo(
    asset.url,
    "视频.mp4",
  );
  const [audioAsset, videoAsset] = await Promise.all([
    uploadFile(audio),
    uploadFile(silentVideo),
  ]);
  const videoJob = await registerLocalJob({
    kind: "video",
    prompt: "分离音频 · 无声视频",
    assetIds: [videoAsset.id],
  });
  return { videoJobId: videoJob.id, audioAssetId: audioAsset.id };
}

export async function trimStudioVideo(
  asset: StudioMediaAsset,
  range: { start: number; end: number },
): Promise<{ id: string }> {
  const file = await trimVideoToFile(
    asset.url,
    range.start,
    range.end,
    "视频.mp4",
  );
  const uploaded = await uploadFile(file);
  return registerLocalJob({
    kind: "video",
    prompt: "视频剪辑",
    assetIds: [uploaded.id],
  });
}
