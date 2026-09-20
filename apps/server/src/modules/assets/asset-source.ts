import { resolveAssetSource, type AssetSource } from "@joyai/shared";

type JobLike = {
  canvasProjectId?: string | null;
  input?: Record<string, unknown> | null;
} | null;

export function sourceFromJob(job: JobLike): AssetSource {
  const input = job?.input ?? {};
  const canvasProjectId =
    job?.canvasProjectId ??
    (typeof input.canvasProjectId === "string" ? input.canvasProjectId : null);
  const manjuProjectId =
    typeof input.manjuProjectId === "string" ? input.manjuProjectId : null;
  return resolveAssetSource({
    jobId: "job",
    canvasProjectId,
    manjuProjectId,
  });
}

export function sourceFromAsset(asset: {
  source?: string | null;
  jobId?: string | null;
  meta?: Record<string, unknown> | null;
  job?: JobLike;
}): AssetSource {
  const metaSource =
    typeof asset.meta?.source === "string" ? asset.meta.source : null;
  const input = asset.job?.input ?? {};
  return resolveAssetSource({
    source: asset.source ?? metaSource,
    jobId: asset.jobId,
    canvasProjectId:
      asset.job?.canvasProjectId ??
      (typeof input.canvasProjectId === "string"
        ? input.canvasProjectId
        : null),
    manjuProjectId:
      typeof input.manjuProjectId === "string" ? input.manjuProjectId : null,
  });
}
