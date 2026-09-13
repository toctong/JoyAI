import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job as BullJob, Queue } from "bullmq";
import { getVideoProvider } from "@joyai/ai-providers";
import { QUEUE } from "@joyai/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
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
  attempt: number;
};

@Processor(QUEUE.VIDEO_POLL)
export class VideoPollProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoPollProcessor.name);
  private readonly maxAttempts = 120;

  constructor(
    private readonly prisma: PrismaService,
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
    const job = await this.prisma.job.findUnique({ where: { id: payload.jobId } });
    if (!job) return;

    const provider = getVideoProvider(payload.platform);
    const result = await provider.poll({
      remoteTaskId: payload.remoteTaskId,
      apiKey: payload.apiKey,
      baseUrl: payload.baseUrl,
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
        meta: meta as Prisma.InputJsonValue | undefined,
      });

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          progress: 100,
          result: {
            assetIds: [asset.id],
            urls: [asset.url],
          } as Prisma.InputJsonValue,
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
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: result.error,
          progress: 100,
        },
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error: result.error,
      });
      return;
    }

    if (payload.attempt >= this.maxAttempts) {
      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          status: "failed",
          error: "视频生成轮询超时",
          progress: 100,
        },
      });
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error: "视频生成轮询超时",
      });
      return;
    }

    const progress = Math.min(90, 20 + payload.attempt);
    await this.prisma.job.update({
      where: { id: job.id },
      data: { status: "polling", progress },
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
