import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob, Queue } from "bullmq";
import { Repository } from "typeorm";
import { resolveImageProvider } from "@joyai/ai-providers";
import { QUEUE } from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { ChannelsService } from "../../channels/channels.service";
import { JobsService } from "../jobs.service";
import { StorageService } from "../../storage/storage.service";
import { AssetsService } from "../../assets/assets.service";
import { sourceFromJob } from "../../assets/asset-source";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { CanvasService } from "../../canvas/canvas.service";
import { enqueueAssetMirror } from "../enqueue-asset-mirror";

/** Parallel image jobs per server process (cap 20). Override with JOB_IMAGE_CONCURRENCY. */
function resolveImageConcurrency(): number {
  const n = Number(process.env.JOB_IMAGE_CONCURRENCY);
  if (!Number.isFinite(n) || n < 1) return 5;
  return Math.min(Math.floor(n), 20);
}

@Processor(QUEUE.IMAGE, {
  concurrency: resolveImageConcurrency(),
  // In-process provider poll can run ~15m; keep lock well above that.
  lockDuration: 16 * 60_000,
})
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly channels: ChannelsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    private readonly canvas: CanvasService,
    @InjectQueue(QUEUE.ASSET_MIRROR) private readonly mirrorQueue: Queue,
  ) {
    super();
  }

  async process(bullJob: BullJob<{ jobId: string }>) {
    const { jobId } = bullJob.data;
    const job = await this.jobsRepo.findOne({ where: { id: jobId } });
    if (!job) return;

    try {
      await this.jobs.markStarted(jobId);
      await this.jobsRepo.update(jobId, {
        status: JobStatus.running,
        progress: 10,
      });
      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "running",
        progress: 10,
      });

      const input = job.input as {
        prompt: string;
        negativePrompt?: string;
        size?: string;
        width?: number;
        height?: number;
        ratio?: string;
        resolution?: string;
        n?: number;
        modelId?: string;
        referenceAssetIds?: string[];
        referenceUrls?: string[];
        canvasProjectId?: string;
        canvasNodeId?: string;
        operation?: "generate" | "outpaint" | "inpaint";
      };

      const operation = input.operation ?? "generate";
      const model = await this.channels.resolveForKind("image", input.modelId);
      const referenceUrls = await this.jobs.resolveReferenceUrls(
        job.userId,
        input.referenceAssetIds,
        input.referenceUrls,
      );

      if (
        (operation === "outpaint" || operation === "inpaint") &&
        referenceUrls.length === 0
      ) {
        throw new Error(
          `${operation === "outpaint" ? "扩图" : "局部重绘"}需要参考图（连线或 @ 引用）`,
        );
      }

      const prompt =
        operation === "outpaint"
          ? `[Outpaint / 扩图] ${input.prompt}`
          : operation === "inpaint"
            ? `[Inpaint / 局部重绘] ${input.prompt}`
            : input.prompt;

      const caps = (model.capabilities ?? null) as {
        sizes?: string[];
        ratios?: string[];
        resolutions?: string[];
        async?: boolean;
        adapterId?: string;
        protocol?: {
          imageProfile?: string;
          modelAlias?: string;
          imagePath?: "generations" | "edits";
        };
      } | null;
      const pixelRe = /^\d+\s*[x×*]\s*\d+$/i;
      const catalogSizes = [
        ...(caps?.sizes ?? []),
        ...(caps?.resolutions ?? []).filter((s) => pixelRe.test(s)),
      ].filter((s) => pixelRe.test(s));
      const hasSizes = catalogSizes.length > 0;
      const hasRatios = Boolean(caps?.ratios?.length);
      const realResolutions = (caps?.resolutions ?? []).filter(
        (r) => !pixelRe.test(String(r)),
      );
      const hasResolutions = realResolutions.length > 0;
      const hasK = Boolean(
        realResolutions.some((r) =>
          /^\d+(\.\d+)?k$/i.test(String(r).trim()),
        ),
      );
      let sizeMode: "keyword" | "pixels" | "auto" = "auto";
      if (hasSizes) sizeMode = "pixels";
      else if (hasK) sizeMode = "auto";
      else if (hasRatios && hasResolutions) sizeMode = "pixels";
      else if (hasResolutions && !hasRatios) sizeMode = "keyword";

      const provider = resolveImageProvider({
        platform: model.channel.platform,
        capabilities: caps,
      });
      const count = Math.max(1, Math.min(Number(input.n) || 1, 4));
      // Seedream 等模型常忽略 n / 只当组图上限；数量选择按「独立出图」并发请求，保证张数
      const batches = await Promise.all(
        Array.from({ length: count }, () =>
          provider.generate({
            prompt,
            negativePrompt: input.negativePrompt,
            size: input.size,
            width: input.width,
            height: input.height,
            ratio: input.ratio,
            resolution: input.resolution,
            catalogSizes,
            sizeMode,
            n: 1,
            watermark: false,
            referenceUrls,
            async: caps?.async,
            protocol: caps?.protocol ?? null,
            model: model.remoteId,
            apiKey: model.channel.apiKey,
            baseUrl: model.channel.baseUrl,
            metadata: model.channel.metadata ?? null,
          }),
        ),
      );
      const result = {
        images: batches.flatMap((b) => b.images),
        raw: count === 1 ? batches[0]?.raw : batches.map((b) => b.raw),
      };

      const mirror = this.storage.isConfigured();
      const createdAssets = [];
      const pendingMirrors: Array<{ assetId: string; originUrl: string }> = [];

      for (const img of result.images) {
        let url = img.url;
        if (!url && img.b64) {
          const buf = Buffer.from(img.b64, "base64");
          const put = await this.storage.putObject(buf, {
            contentType: "image/png",
            ext: "png",
          });
          url = put.url;
          const assetSource = sourceFromJob(job);
          const asset = await this.assets.create({
            userId: job.userId,
            jobId,
            kind: "image",
            url,
            md5: put.md5,
            mimeType: "image/png",
            size: put.size,
            source: assetSource,
            meta: {
              source: assetSource,
              sha256: put.sha256,
              storageKey: put.key,
              tosDeduplicated: put.deduplicated,
              storageStatus: "ready",
            },
          });
          createdAssets.push(asset);
          continue;
        }
        if (!url) continue;

        const assetSource = sourceFromJob(job);
        const asset = await this.assets.create({
          userId: job.userId,
          jobId,
          kind: "image",
          url,
          mimeType: "image/png",
          source: assetSource,
          meta: {
            source: assetSource,
            originUrl: url,
            storageStatus: mirror ? "pending" : "ready",
          },
        });
        createdAssets.push(asset);
        if (mirror) {
          pendingMirrors.push({ assetId: asset.id, originUrl: url });
        }
      }

      const latest = await this.jobsRepo.findOne({ where: { id: jobId } });
      if (!latest || latest.status === JobStatus.cancelled) {
        return;
      }

      await this.jobsRepo.update(jobId, {
        status: JobStatus.succeeded,
        progress: 100,
        finishedAt: new Date(),
        result: {
          assetIds: createdAssets.map((a) => a.id),
          urls: createdAssets.map((a) => a.url),
        },
      });

      if (input.canvasProjectId && input.canvasNodeId && createdAssets[0]) {
        await this.canvas.patchNodeAsset(
          job.userId,
          input.canvasProjectId,
          input.canvasNodeId,
          {
            assetId: createdAssets[0].id,
            url: createdAssets[0].url,
            jobId,
          },
        );
      }

      this.realtime.emitJob(job.userId, "job:completed", {
        jobId,
        status: "succeeded",
        assets: createdAssets.map((a) => ({ id: a.id, url: a.url })),
      });

      for (const item of pendingMirrors) {
        await enqueueAssetMirror(this.mirrorQueue, {
          assetId: item.assetId,
          originUrl: item.originUrl,
          ext: "png",
          userId: job.userId,
          jobId,
          canvasProjectId: input.canvasProjectId,
          canvasNodeId: input.canvasNodeId,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await this.jobsRepo.findOne({ where: { id: jobId } });
      if (latest?.status === JobStatus.cancelled) {
        return;
      }
      this.logger.error(`Image job ${jobId} failed: ${message}`);
      await this.jobsRepo.update(jobId, {
        status: JobStatus.failed,
        error: message,
        progress: 100,
        finishedAt: new Date(),
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId,
        status: "failed",
        error: message,
      });
      throw error;
    }
  }
}
