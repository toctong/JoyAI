import type { CanvasSnapshot } from "@joyai/shared";
import type { ManjuProjectDraft, ManjuShotDraft } from "../manju-types";

const IMG_W = 340;
const IMG_H = 240;
const VID_W = 420;
const VID_H = 236;
const GAP_X = 48;
const GAP_Y = 28;
const COL_W = Math.max(IMG_W, VID_W);

function shotLabel(shot: ManjuShotDraft): string {
  return `镜头 ${String(shot.index).padStart(2, "0")}`;
}

/** 把有媒体的镜头排成一排：上分镜图、下视频（仅 assetId/url） */
export function buildManjuCanvasSnapshot(
  shots: ManjuShotDraft[],
): CanvasSnapshot {
  const nodes: CanvasSnapshot["nodes"] = [];
  let col = 0;

  for (const shot of shots) {
    const hasImage = Boolean(shot.storyboardImageUrl || shot.storyboardAssetId);
    const hasVideo = Boolean(shot.videoUrl || shot.videoAssetId);
    if (!hasImage && !hasVideo) continue;

    const x = 80 + col * (COL_W + GAP_X);
    const label = shotLabel(shot);
    let y = 80;

    if (hasImage) {
      nodes.push({
        id: crypto.randomUUID(),
        type: "image",
        x,
        y,
        width: IMG_W,
        height: IMG_H,
        data: {
          url: shot.storyboardImageUrl ?? "",
          assetId: shot.storyboardAssetId ?? "",
          status: "succeeded",
          title: `${label} · 分镜`,
        },
      });
      y += IMG_H + GAP_Y;
    }

    if (hasVideo) {
      nodes.push({
        id: crypto.randomUUID(),
        type: "video",
        x,
        y,
        width: VID_W,
        height: VID_H,
        data: {
          url: shot.videoUrl ?? "",
          assetId: shot.videoAssetId ?? "",
          status: "succeeded",
          title: `${label} · 视频`,
        },
      });
    }

    col += 1;
  }

  return {
    version: 2,
    nodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 0.85 },
  };
}

export function shotsForCanvasPush(
  project: ManjuProjectDraft,
  episodeId?: string | null,
): ManjuShotDraft[] {
  const pool = episodeId
    ? project.shots.filter((s) => s.episodeId === episodeId)
    : project.shots;
  return pool.filter(
    (s) =>
      s.storyboardImageUrl ||
      s.storyboardAssetId ||
      s.videoUrl ||
      s.videoAssetId,
  );
}
