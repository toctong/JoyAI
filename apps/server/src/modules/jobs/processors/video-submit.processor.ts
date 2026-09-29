import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob, Queue } from "bullmq";
import { Repository } from "typeorm";
import { resolveVideoProvider } from "@joyai/ai-providers";
import { QUEUE, type VideoJobInput } from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { ChannelsService } from "../../channels/channels.service";
import { JobsService } from "../jobs.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";

@Processor(QUEUE.VIDEO_SUBMIT)
export class VideoSubmitProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoSubmitProcessor.name);

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly channels: ChannelsService,
    private readonly jobs: JobsService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(QUEUE.VIDEO_POLL) private readonly pollQueue: Queue,
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
        progress: 5,
      });
      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "running",
        progress: 5,
      });

      const input = job.input as VideoJobInput;

      const model = await this.channels.resolveForKind("video", input.modelId);
      const referenceMedia = await this.jobs.resolveReferenceMedia(
        job.userId,
        input.referenceAssetIds,
        input.referenceUrls,
      );
      const referenceUrls = referenceMedia.map((r) => r.url);
      const referenceMediaKinds = referenceMedia.map((r) => r.kind);

      const features = Array.isArray(
        (model.capabilities as { features?: unknown } | null)?.features,
      )
        ? (
            (model.capabilities as { features: string[] }).features ?? []
          ).map((f) => String(f).toLowerCase())
        : [];
      const nativeFirstLast = features.includes("first-last-frame");
      const refMode = input.refMode;
      const firstLastViaPrompt =
        refMode === "first_last" && !nativeFirstLast;

      const provider = resolveVideoProvider({
        platform: model.channel.platform,
        capabilities: model.capabilities as { adapterId?: unknown } | null,
      });
      const channelMeta =
        (model.channel.metadata as Record<string, unknown> | null) ?? null;
      const { remoteTaskId } = await provider.submit({
        prompt: input.prompt,
        model: model.remoteId,
        apiKey: model.channel.apiKey,
        baseUrl: model.channel.baseUrl,
        ratio: input.ratio,
        duration: input.duration,
        resolution: input.resolution,
        referenceUrls,
        referenceMediaKinds,
        refMode,
        firstLastViaPrompt,
        generateAudio: input.generateAudio,
        metadata: channelMeta,
      });

      await this.jobsRepo.update(jobId, {
        status: JobStatus.running,
        remoteTaskId,
        progress: 20,
      });

      await this.pollQueue.add(
        "poll",
        {
          jobId,
          remoteTaskId,
          platform: model.channel.platform,
          adapterId: provider.adapterId,
          apiKey: model.channel.apiKey,
          baseUrl: model.channel.baseUrl,
          metadata: channelMeta,
          attempt: 0,
        },
        { delay: 5000, removeOnComplete: 100, removeOnFail: 200 },
      );

      this.realtime.emitJob(job.userId, "job:progress", {
        jobId,
        status: "running",
        progress: 20,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Video submit ${jobId} failed: ${message}`);
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
        kind: "video",
      });
      throw error;
    }
  }
}
