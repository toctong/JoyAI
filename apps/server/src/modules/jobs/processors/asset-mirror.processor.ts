import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job as BullJob } from "bullmq";
import { QUEUE } from "@joyai/shared";
import { StorageService } from "../../storage/storage.service";
import { AssetsService } from "../../assets/assets.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { CanvasService } from "../../canvas/canvas.service";

export type AssetMirrorPayload = {
  assetId: string;
  originUrl: string;
  ext: string;
  userId: string;
  jobId?: string;
  canvasProjectId?: string;
  canvasNodeId?: string;
};

@Processor(QUEUE.ASSET_MIRROR)
export class AssetMirrorProcessor extends WorkerHost {
  private readonly logger = new Logger(AssetMirrorProcessor.name);

  constructor(
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    private readonly canvas: CanvasService,
  ) {
    super();
  }

  async process(bullJob: BullJob<AssetMirrorPayload>) {
    const payload = bullJob.data;
    if (!this.storage.isConfigured()) {
      await this.assets.patchMeta(payload.assetId, {
        storageStatus: "ready",
        originUrl: payload.originUrl,
      });
      return;
    }

    try {
      const reused = await this.assets.findMirroredByOriginUrl(payload.originUrl);
      const put = reused
        ? {
            key:
              (typeof reused.meta?.storageKey === "string" &&
                reused.meta.storageKey) ||
              this.storage.keyFromPublicUrl(reused.url) ||
              "",
            url: reused.url,
            md5: reused.md5 ?? "",
            sha256:
              typeof reused.meta?.sha256 === "string" ? reused.meta.sha256 : "",
            size: reused.size ?? 0,
            deduplicated: true,
            skippedDownload: true,
          }
        : await this.storage.putFromUrl(payload.originUrl, payload.ext);

      if (reused) {
        this.logger.debug(
          `Asset mirror reuse originUrl → asset ${reused.id} for ${payload.assetId}`,
        );
      }

      const existing = await this.assets.findById(payload.assetId);
      const nextMeta: Record<string, unknown> = {
        ...(existing?.meta ?? {}),
        originUrl: payload.originUrl,
        storageStatus: "ready",
        ...(put.sha256 ? { sha256: put.sha256 } : {}),
        ...(put.key ? { storageKey: put.key } : {}),
        tosDeduplicated: put.deduplicated,
        ...(put.skippedDownload ? { mirrorSkippedDownload: true } : {}),
      };

      const asset = await this.assets.updateMirrored(payload.assetId, {
        url: put.url,
        md5: put.md5 || undefined,
        size: put.size || undefined,
        meta: nextMeta,
      });
      if (!asset) {
        this.logger.warn(`Asset mirror missing asset ${payload.assetId}`);
        return;
      }

      if (
        payload.jobId &&
        payload.canvasProjectId &&
        payload.canvasNodeId
      ) {
        await this.canvas.patchNodeAsset(
          payload.userId,
          payload.canvasProjectId,
          payload.canvasNodeId,
          {
            assetId: asset.id,
            url: asset.url,
            jobId: payload.jobId,
          },
        );
      }

      this.realtime.emitJob(payload.userId, "asset:updated", {
        asset,
        jobId: payload.jobId ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Asset mirror ${payload.assetId} failed attempt=${bullJob.attemptsMade}: ${message}`,
      );
      await this.assets.patchMeta(payload.assetId, {
        originUrl: payload.originUrl,
        storageStatus: "failed",
        storageError: message,
      });
      const asset = await this.assets.findById(payload.assetId);
      if (asset) {
        this.realtime.emitJob(payload.userId, "asset:updated", {
          asset,
          jobId: payload.jobId ?? null,
        });
      }
      throw error;
    }
  }
}
