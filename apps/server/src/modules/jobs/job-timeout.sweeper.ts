import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Job } from "../../database/entities/job.entity";
import { JobKind, JobStatus } from "../../database/enums";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const BUSY: JobStatus[] = [
  JobStatus.queued,
  JobStatus.running,
  JobStatus.polling,
];

function envMs(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

@Injectable()
export class JobTimeoutSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobTimeoutSweeper.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Image generate + provider poll (~2m) + queue slack. */
  private readonly imageBusyMs: number;
  /** Video poll can run 20–40m; keep headroom. */
  private readonly videoBusyMs: number;
  /** Stuck in queue (worker/Redis down). */
  private readonly queuedMs: number;
  private readonly intervalMs: number;

  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    private readonly realtime: RealtimeGateway,
    config: ConfigService,
  ) {
    this.imageBusyMs = envMs(config, "JOB_IMAGE_TIMEOUT_MS", 15 * 60_000);
    this.videoBusyMs = envMs(config, "JOB_VIDEO_TIMEOUT_MS", 50 * 60_000);
    this.queuedMs = envMs(config, "JOB_QUEUED_TIMEOUT_MS", 20 * 60_000);
    this.intervalMs = envMs(config, "JOB_TIMEOUT_SWEEP_MS", 60_000);
  }

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.sweep().catch((e) =>
        this.logger.warn(
          `Job timeout sweep failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
    }, this.intervalMs);
    // Don't keep the process alive solely for this timer.
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sweep(): Promise<number> {
    const rows = await this.jobs.find({
      where: { status: In(BUSY) },
      take: 300,
      order: { createdAt: "ASC" },
    });
    if (!rows.length) return 0;

    const now = Date.now();
    let failed = 0;

    for (const job of rows) {
      const limitMs = this.limitFor(job);
      const anchor = this.anchorMs(job);
      if (now - anchor < limitMs) continue;

      const error = this.messageFor(job);
      const result = await this.jobs
        .createQueryBuilder()
        .update(Job)
        .set({
          status: JobStatus.failed,
          error,
          progress: 100,
          finishedAt: new Date(),
        })
        .where("id = :id", { id: job.id })
        .andWhere("status IN (:...statuses)", { statuses: BUSY })
        .execute();
      if (!result.affected) continue;

      failed += 1;
      this.logger.warn(
        `Stale job ${job.id} (${job.kind}/${job.status}) auto-failed after ${Math.round((now - anchor) / 1000)}s`,
      );
      this.realtime.emitJob(job.userId, "job:failed", {
        jobId: job.id,
        status: "failed",
        error,
      });
    }

    return failed;
  }

  private limitFor(job: Job): number {
    if (job.status === JobStatus.queued) return this.queuedMs;
    return job.kind === JobKind.video ? this.videoBusyMs : this.imageBusyMs;
  }

  private anchorMs(job: Job): number {
    const toMs = (value: Date | string | null | undefined) => {
      if (value == null) return null;
      const ms =
        value instanceof Date ? value.getTime() : Date.parse(String(value));
      return Number.isFinite(ms) ? ms : null;
    };
    // Queued: never started — clock from create.
    if (job.status === JobStatus.queued) {
      return toMs(job.createdAt) ?? Date.now();
    }
    return toMs(job.startedAt) ?? toMs(job.createdAt) ?? Date.now();
  }

  private messageFor(job: Job): string {
    if (job.status === JobStatus.queued) {
      return "任务排队超时，已自动结束，请重试";
    }
    return job.kind === JobKind.video
      ? "视频任务执行超时，已自动结束"
      : "图片任务执行超时，已自动结束";
  }
}
