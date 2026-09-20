import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Job as BullJob } from "bullmq";
import { Repository } from "typeorm";
import { resolveAudioProvider } from "@joyai/ai-providers";
import { QUEUE, type AudioJobInput } from "@joyai/shared";
import { Job } from "../../../database/entities/job.entity";
import { JobStatus } from "../../../database/enums";
import { ChannelsService } from "../../channels/channels.service";
import { JobsService } from "../jobs.service";
import { StorageService } from "../../storage/storage.service";
import { AssetsService } from "../../assets/assets.service";
import { RealtimeGateway } from "../../realtime/realtime.gateway";
import { CanvasService } from "../../canvas/canvas.service";

function resolveAudioConcurrency(): number {
  const n = Number(process.env.JOB_AUDIO_CONCURRENCY);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(Math.floor(n), 10);
}

@Processor(QUEUE.AUDIO, { concurrency: resolveAudioConcurrency() })
export class AudioProcessor extends WorkerHost {
  private readonly logger = new Logger(AudioProcessor.name);

  constructor(
    @InjectRepository(Job) private readonly jobsRepo: Repository<Job>,
    private readonly channels: ChannelsService,
    private readonly jobs: JobsService,
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    private readonly canvas: CanvasService,
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

      const input = job.input as AudioJobInput;
      const model = await this.channels.resolveForKind("audio", input.modelId);
      const caps = (model.capabilities ?? null) as {
        adapterId?: string;
      } | null;

      if (!this.storage.isConfigured()) {
        throw new Error("对象存储未配置，无法保存 TTS 音频");
      }

      const provider = resolveAudioProvider({
        platform: model.channel.platform,
        capabilities: caps,
      });
      const result = await provider.generate({
        prompt: input.prompt,
        voice: input.voice,
        format: input.format,
        speed: input.speed,
        instructions: input.instructions,
        model: model.remoteId,
        apiKey: model.channel.apiKey,
        baseUrl: model.channel.baseUrl,
        metadata: model.channel.metadata ?? null,
      });

      const format = result.audio.format || input.format || "mp3";
      const put = await this.storage.putObject(
        Buffer.from(result.audio.bytes),
        {
          contentType: result.audio.mimeType,
          ext: format,
        },
      );

      const asset = await this.assets.create({
        userId: job.userId,
        jobId,
        kind: "audio",
        url: put.url,
        md5: put.md5,
        mimeType: result.audio.mimeType,
        size: put.size,
        meta: {
          sha256: put.sha256,
          storageKey: put.key,
          tosDeduplicated: put.deduplicated,
          storageStatus: "ready",
          format,
          voice: input.voice ?? "alloy",
        },
      });

      const latest = await this.jobsRepo.findOne({ where: { id: jobId } });
      if (!latest || latest.status === JobStatus.cancelled) {
        return;
      }

      await this.jobsRepo.update(jobId, {
        status: JobStatus.succeeded,
        progress: 100,
        finishedAt: new Date(),
        result: {
          assetIds: [asset.id],
          urls: [asset.url],
        },
      });

      if (input.canvasProjectId && input.canvasNodeId) {
        await this.canvas.patchNodeAsset(
          job.userId,
          input.canvasProjectId,
          input.canvasNodeId,
          {
            assetId: asset.id,
            url: asset.url,
            jobId,
          },
        );
      }

      this.realtime.emitJob(job.userId, "job:completed", {
        jobId,
        status: "succeeded",
        assets: [{ id: asset.id, url: asset.url }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await this.jobsRepo.findOne({ where: { id: jobId } });
      if (latest?.status === JobStatus.cancelled) {
        return;
      }
      this.logger.error(`Audio job ${jobId} failed: ${message}`);
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
