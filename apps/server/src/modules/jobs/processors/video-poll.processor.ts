import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob, Queue } from "bullmq";
import { Repository } from "typeorm";
import { getVideoProvider } from "@joyai/ai-providers";
import { QUEUE } from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { StorageService } from "../../storage/storage.service";
import { AssetsService } from "../../assets/assets.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { CanvasService } from "../../canvas/canvas.service";

type PollPayload = {
  jobId: string;
  remoteTaskId: string;
  platform: string;
  apiKey: string;
  baseUrl: string;
  metadata?: Record<string, unknown> | null;
  attempt: number;
};

@Processor(QUEUE.VIDEO_POLL)
export class VideoPollProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoPollProcessor.name);
  private readonly maxAttempts = 120;

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    private readonly canvas: CanvasService,
    @InjectQueue(QUEUE.VIDEO_POLL) private readonly pollQueue: Queue,
  ) {
    super();
  }

  async process(bullJob: BullJob<PollPayload>) {
    const payload = bullJob.data;
    const job = await this.jobsRepo.findOne({ where: { id: payload.jobId } });
    if (!job) return;

    const provider = getVideoProvider(payload.platform);
    const result = await provider.poll({
      remoteTaskId: payload.remoteTaskId,
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
      metadata: payload.metadata ?? null,
    });

    if (result.status === "succeeded") {
      let url = result.videoUrl;
      let md5: string | undefined;
      let size: number | undefined;
      let meta: Record<string, unknown> | undefined;

      if (this.storage.isConfigured()) {
        try {
          const put = await this.storage.putFromUrl(url, "mp4");
          url = put.url;
          md5 = put.md5;
          size = put.size;
          meta = {
            sha256: put.sha256,
            storageKey: put.key,
            tosDeduplicated: put.deduplicated,
          };
        } catch (e) {
          this.logger.warn(`TOS mirror video failed: ${e}`);
        }
      }

      const asset = await this.assets.create({
        userId: job.userId,
        jobId: job.id,
        kind: "video",
        url,
        md5,
        mimeType: "video/mp4",
        size,
        meta,
      });

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
        assets: [asset],
      });
      return;
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
      await this.jobsRepo.update(job.id, {
        status: JobStatus.failed,
        error: "视频生成轮询超时",
        progress: 100,
        finishedAt: new Date(),
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error: "视频生成轮询超时",
      });
      return;
    }

    const progress = Math.min(90, 20 + payload.attempt);
    await this.jobsRepo.update(job.id, {
      status: JobStatus.polling,
      progress,
    });
    this.realtime.emitJob(job.userId, "job:progress", {
      jobId: job.id,
      status: "polling",
      progress,
    });

    const delay = Math.min(15_000, 3000 + payload.attempt * 500);
    await this.pollQueue.add(
      "poll",
      { ...payload, attempt: payload.attempt + 1 },
      { delay, removeOnComplete: 100, removeOnFail: 200 },
    );
  }
}
