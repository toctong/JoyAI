import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob, Queue } from "bullmq";
import { Repository } from "typeorm";
import { resolveVideoProvider } from "@joyai/ai-providers";
import { QUEUE } from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { StorageService } from "../../storage/storage.service";
import { AssetsService } from "../../assets/assets.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { CanvasService } from "../../canvas/canvas.service";
import { enqueueAssetMirror } from "../enqueue-asset-mirror";

type PollPayload = {
  jobId: string;
  remoteTaskId: string;
  platform: string;
  /** Protocol adapter id; falls back to platform default when missing. */
  adapterId?: string;
  apiKey: string;
  baseUrl: string;
  metadata?: Record<string, unknown> | null;
  attempt: number;
};

@Processor(QUEUE.VIDEO_POLL)
export class VideoPollProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoPollProcessor.name);
  private readonly maxAttempts = 180; // ~20-40min depending on backoff

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    private readonly canvas: CanvasService,
    @InjectQueue(QUEUE.VIDEO_POLL) private readonly pollQueue: Queue,
    @InjectQueue(QUEUE.ASSET_MIRROR) private readonly mirrorQueue: Queue,
  ) {
    super();
  }

  async process(bullJob: BullJob<PollPayload>) {
    const payload = bullJob.data;
    const job = await this.jobsRepo.findOne({ where: { id: payload.jobId } });
    if (!job) return;
    if (job.status === JobStatus.cancelled) return;

    let result;
    try {
      const provider = resolveVideoProvider({
        platform: payload.platform,
        adapterId: payload.adapterId,
      });
      result = await provider.poll({
        remoteTaskId: payload.remoteTaskId,
        apiKey: payload.apiKey,
        baseUrl: payload.baseUrl,
        metadata: payload.metadata ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Video poll ${payload.jobId} soft-fail attempt=${payload.attempt}: ${message}`,
      );
      result = { status: "running" as const };
    }

    if (result.status === "succeeded") {
      const originUrl = result.videoUrl;
      if (!originUrl) {
        this.logger.warn(
          `Video poll ${payload.jobId} succeeded without videoUrl; keep polling`,
        );
        result = { status: "running" as const };
      } else {
        const mirror = this.storage.isConfigured();
        const asset = await this.assets.create({
          userId: job.userId,
          jobId: job.id,
          kind: "video",
          url: originUrl,
          mimeType: "video/mp4",
          meta: {
            originUrl,
            storageStatus: mirror ? "pending" : "ready",
          },
        });

        const latest = await this.jobsRepo.findOne({ where: { id: job.id } });
        if (!latest || latest.status === JobStatus.cancelled) {
          return;
        }

        await this.jobsRepo.update(job.id, {
          status: JobStatus.succeeded,
          progress: 100,
          finishedAt: new Date(),
          result: {
            assetIds: [asset.id],
            urls: [asset.url],
          },
        });

        const input = job.input as {
          canvasProjectId?: string;
          canvasNodeId?: string;
        };
        if (input.canvasProjectId && input.canvasNodeId) {
          await this.canvas.patchNodeAsset(
            job.userId,
            input.canvasProjectId,
            input.canvasNodeId,
            { assetId: asset.id, url: asset.url, jobId: job.id },
          );
        }

        this.realtime.emitJob(job.userId, "job:completed", {
          jobId: job.id,
          status: "succeeded",
          assets: [{ id: asset.id, url: asset.url }],
        });

        if (mirror) {
          await enqueueAssetMirror(this.mirrorQueue, {
            assetId: asset.id,
            originUrl,
            ext: "mp4",
            userId: job.userId,
            jobId: job.id,
            canvasProjectId: input.canvasProjectId,
            canvasNodeId: input.canvasNodeId,
          });
        }
        return;
      }
    }

    if (result.status === "failed") {
      await this.jobsRepo.update(job.id, {
        status: JobStatus.failed,
        error: result.error ?? null,
        progress: 100,
        finishedAt: new Date(),
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error: result.error,
      });
      return;
    }

    if (payload.attempt >= this.maxAttempts) {
      const timeoutMsg = "视频任务轮询超时，请稍后重试或到渠道后台查看任务状态";
      await this.jobsRepo.update(job.id, {
        status: JobStatus.failed,
        error: timeoutMsg,
        progress: 100,
        finishedAt: new Date(),
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error: timeoutMsg,
      });
      return;
    }

    const phaseStatus =
      result.status === "queued" ? JobStatus.queued : JobStatus.running;
    const progress =
      result.status === "queued"
        ? Math.min(35, 15 + Math.floor(payload.attempt / 2))
        : Math.min(88, 35 + Math.floor(payload.attempt / 2));

    if (payload.attempt > 0 && payload.attempt % 10 === 0) {
      this.logger.log(
        `Video poll ${payload.jobId} still ${result.status} attempt=${payload.attempt} remote=${payload.remoteTaskId}`,
      );
    }

    await this.jobsRepo.update(job.id, {
      status: phaseStatus,
      progress,
    });
    this.realtime.emitJob(job.userId, "job:progress", {
      jobId: job.id,
      status: phaseStatus,
      progress,
    });

    const delay = Math.min(20_000, 4000 + payload.attempt * 400);
    await this.pollQueue.add(
      "poll",
      { ...payload, attempt: payload.attempt + 1 },
      { delay, removeOnComplete: 100, removeOnFail: 200 },
    );
  }
}
