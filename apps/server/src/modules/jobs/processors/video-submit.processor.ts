import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job as BullJob, Queue } from "bullmq";
import { getVideoProvider } from "@joyai/ai-providers";
import { QUEUE } from "@joyai/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ChannelsService } from "../../channels/channels.service";
import { JobsService } from "../jobs.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";

@Processor(QUEUE.VIDEO_SUBMIT)
export class VideoSubmitProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoSubmitProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelsService,
    private readonly jobs: JobsService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(QUEUE.VIDEO_POLL) private readonly pollQueue: Queue,
  ) {
    super();
  }

  async process(bullJob: BullJob<{ jobId: string }>) {
    const { jobId } = bullJob.data;
    const job = await this.prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    try {
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "running", progress: 5 },
      });
      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "running",
        progress: 5,
      });

      const input = job.input as {
        prompt: string;
        duration?: number;
        ratio?: string;
        modelId?: string;
        referenceAssetIds?: string[];
        referenceUrls?: string[];
      };

      const model = await this.channels.resolveForKind("video", input.modelId);
      const referenceUrls = await this.jobs.resolveReferenceUrls(
        job.userId,
        input.referenceAssetIds,
        input.referenceUrls,
      );

      const provider = getVideoProvider(model.channel.platform);
      const { remoteTaskId } = await provider.submit({
        prompt: input.prompt,
        model: model.remoteId,
        apiKey: model.channel.apiKey,
        baseUrl: model.channel.baseUrl,
        ratio: input.ratio,
        duration: input.duration,
        referenceUrls,
      });

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: "polling",
          remoteTaskId,
          progress: 20,
        },
      });

      await this.pollQueue.add(
        "poll",
        {
          jobId,
          remoteTaskId,
          platform: model.channel.platform,
          apiKey: model.channel.apiKey,
          baseUrl: model.channel.baseUrl,
          attempt: 0,
        },
        { delay: 3000, removeOnComplete: 100, removeOnFail: 200 },
      );

      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "polling",
        progress: 20,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Video submit ${jobId} failed: ${message}`);
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: "failed", error: message, progress: 100 },
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
