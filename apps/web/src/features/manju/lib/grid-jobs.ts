import { apiUpload } from "@/shared/lib/api";
import { splitImageToPieces } from "@/features/canvas/lib/image-raster";
import { useManjuStore } from "../manju-store";
import type { ManjuJobStatus } from "../manju-types";

export type PendingGridJob = {
  projectId: string;
  shotIds: string[];
  rows: number;
  cols: number;
};

const pending = new Map<string, PendingGridJob>();

export function registerGridJob(jobId: string, meta: PendingGridJob) {
  pending.set(jobId, meta);
}

export function peekGridJob(jobId: string): PendingGridJob | undefined {
  return pending.get(jobId);
}

export function takeGridJob(jobId: string): PendingGridJob | undefined {
  const hit = pending.get(jobId);
  if (hit) pending.delete(jobId);
  return hit;
}

/** 宫格图完成后切块上传，写回各镜 storyboard* */
export async function applyGridJobSplit(
  jobId: string,
  meta: PendingGridJob,
  sourceUrl: string,
  status: ManjuJobStatus,
): Promise<void> {
  const store = useManjuStore.getState();
  if (status !== "succeeded" || !sourceUrl) {
    for (const shotId of meta.shotIds) {
      store.updateShot(meta.projectId, shotId, {
        storyboardStatus: status === "failed" ? "failed" : status,
      });
    }
    takeGridJob(jobId);
    return;
  }

  for (const shotId of meta.shotIds) {
    store.updateShot(meta.projectId, shotId, {
      storyboardStatus: "running",
    });
  }

  try {
    const pieces = await splitImageToPieces(sourceUrl, meta.rows, meta.cols);
    const count = Math.min(pieces.length, meta.shotIds.length);
    for (let i = 0; i < count; i += 1) {
      const piece = pieces[i]!;
      const shotId = meta.shotIds[i]!;
      const file = new File([piece.blob], piece.name, { type: "image/png" });
      const saved = await apiUpload<{ id: string; url: string }>(
        "/upload",
        file,
      );
      store.updateShot(meta.projectId, shotId, {
        storyboardImageUrl: saved.url,
        storyboardAssetId: saved.id,
        storyboardJobId: jobId,
        storyboardStatus: "succeeded",
        storyboardStale: false,
        gridCellIndex: i,
      });
    }
    for (let i = count; i < meta.shotIds.length; i += 1) {
      store.updateShot(meta.projectId, meta.shotIds[i]!, {
        storyboardStatus: "failed",
      });
    }
    store.markStepComplete(meta.projectId, "storyboard-script");
    void store.flushSave(meta.projectId);
  } catch {
    for (const shotId of meta.shotIds) {
      store.updateShot(meta.projectId, shotId, {
        storyboardStatus: "failed",
      });
    }
  } finally {
    takeGridJob(jobId);
  }
}
