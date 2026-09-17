import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { In, IsNull, Repository } from "typeorm";
import { CreateJobSchema, QUEUE } from "@joyai/shared";
import { Job } from "../../database/entities/job.entity";
import { Model } from "../../database/entities/model.entity";
import { Asset } from "../../database/entities/asset.entity";
import { User } from "../../database/entities/user.entity";
import { JobKind, JobStatus } from "../../database/enums";
import { ChannelsService } from "../channels/channels.service";
import { AssetsService } from "../assets/assets.service";

type JobWithAssets = Job & { assets: Asset[] };
type JobListRow = Omit<Job, "assignId"> & {
  assets: Asset[];
  user?: Pick<User, "id" | "username">;
};

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Model) private readonly models: Repository<Model>,
    private readonly channels: ChannelsService,
    private readonly assets: AssetsService,
    @InjectQueue(QUEUE.IMAGE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE.VIDEO_SUBMIT) private readonly videoSubmitQueue: Queue,
  ) {}

  async create(userId: string, body: unknown) {
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { kind, input } = parsed.data;

    const model = await this.channels.resolveForKind(kind, input.modelId);
    const queue = kind === "image" ? this.imageQueue : this.videoSubmitQueue;

    // Probe Redis before writing the job row — avoid orphan "执行中" records.
    await this.assertQueueAvailable(queue);

    const job = await this.jobs.save(
      this.jobs.create({
        userId,
        kind: kind as JobKind,
        status: JobStatus.queued,
        input: {
          ...input,
          modelId: model.id,
        },
        modelId: model.id,
        modelName: model.name,
        channelId: model.channelId,
        channelName: model.channel.name,
        platform: model.channel.platform,
        canvasProjectId: input.canvasProjectId ?? null,
        canvasNodeId: input.canvasNodeId ?? null,
      }),
    );

    try {
      if (kind === "image") {
        await this.imageQueue.add(
          "generate",
          { jobId: job.id },
          { removeOnComplete: 100, removeOnFail: 200 },
        );
      } else {
        await this.videoSubmitQueue.add(
          "submit",
          { jobId: job.id },
          { removeOnComplete: 100, removeOnFail: 200 },
        );
      }
    } catch {
      await this.jobs.delete(job.id);
      throw new ServiceUnavailableException(
        "任务队列不可用，请确认 Redis 已启动（docker compose up -d）",
      );
    }

    return this.withDuration(job);
  }

  /** Fail within ~1.5s if Redis is unreachable. */
  private async assertQueueAvailable(queue: Queue, timeoutMs = 1_500) {
    try {
      await Promise.race([
        queue.waitUntilReady().then(async () => {
          const client = await queue.client;
          const pong = await (
            client as unknown as { ping: () => Promise<string> }
          ).ping();
          if (pong !== "PONG" && pong !== "pong") {
            throw new Error("Redis ping failed");
          }
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Redis 连接超时")), timeoutMs);
        }),
      ]);
    } catch {
      throw new ServiceUnavailableException(
        "任务队列不可用，请确认 Redis 已启动（docker compose up -d）",
      );
    }
  }

  /**
   * Studio chat feed: returns a page of jobs sorted ASC by generation time
   * (finishedAt ?? createdAt). Initial call (no before) = newest window.
   * Pass before/beforeId of the oldest visible job to load earlier history.
   *
   * Sort/paginate in memory — sql.js + TypeORM does not reliably support
   * COALESCE(...) in ORDER BY.
   */
  async list(
    userId: string,
    opts: { take?: number; before?: string; beforeId?: string } = {},
  ) {
    const take = Math.min(Math.max(Number(opts.take) || 30, 1), 100);

    const rows = await this.jobs.find({
      where: { userId },
      order: { createdAt: "DESC" },
      relations: ["assets"],
    });
    const enriched = await this.enrichMany(rows);

    const timed = enriched.map((job) => {
      const ms = Date.parse(String(job.finishedAt ?? job.createdAt));
      return {
        job,
        ms: Number.isFinite(ms) ? ms : 0,
      };
    });

    // Newest first for cursor window
    timed.sort((a, b) => {
      if (a.ms !== b.ms) return b.ms - a.ms;
      return String(b.job.id).localeCompare(String(a.job.id));
    });

    let filtered = timed;
    const beforeRaw = opts.before?.trim();
    if (beforeRaw) {
      const beforeMs = Date.parse(beforeRaw);
      if (Number.isFinite(beforeMs)) {
        const beforeId = opts.beforeId?.trim() || "";
        filtered = timed.filter((row) => {
          if (row.ms < beforeMs) return true;
          if (row.ms > beforeMs) return false;
          return String(row.job.id).localeCompare(beforeId) < 0;
        });
      }
    }

    const hasMore = filtered.length > take;
    const pageDesc = hasMore ? filtered.slice(0, take) : filtered;

    // Chat layout: older at top → ASC
    const items = pageDesc
      .map((row) => row.job)
      .reverse();

    return { items, hasMore };
  }

  async listAll(take = 100) {
    const rows = await this.jobs.find({
      order: { createdAt: "DESC" },
      take,
      relations: ["user", "assets"],
    });
    return this.enrichMany(
      rows.map((row) => ({
        ...row,
        user: row.user
          ? { id: row.user.id, username: row.user.username }
          : undefined,
      })) as JobListRow[],
    );
  }

  /** Admin: any user's job by id (full detail). */
  async getAdmin(id: string) {
    const job = await this.jobs.findOne({
      where: { id },
      relations: ["user", "assets"],
    });
    if (!job) throw new NotFoundException("任务不存在");
    const [enriched] = await this.enrichMany([
      {
        ...job,
        user: job.user
          ? { id: job.user.id, username: job.user.username }
          : undefined,
      } as JobListRow,
    ]);
    return enriched;
  }

  async get(userId: string, id: string) {
    const job = await this.jobs.findOne({
      where: { id, userId },
      relations: ["assets"],
    });
    if (!job) throw new NotFoundException("任务不存在");
    const [enriched] = await this.enrichMany([job]);
    return enriched;
  }

  async remove(userId: string, id: string) {
    const job = await this.jobs.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException("任务不存在");
    await this.jobs.remove(job);
    return { ok: true, id };
  }

  async resolveReferenceUrls(
    userId: string,
    referenceAssetIds?: string[],
    referenceUrls?: string[],
  ) {
    const urls = [...(referenceUrls ?? [])];
    if (referenceAssetIds?.length) {
      const assets = await this.assets.findByIds(userId, referenceAssetIds);
      for (const a of assets) urls.push(a.url);
    }
    return urls;
  }

  /** Mark worker start once; safe to call repeatedly. */
  markStarted(jobId: string) {
    return this.jobs.update(
      { id: jobId, startedAt: IsNull() },
      { startedAt: new Date() },
    );
  }

  markFinished(jobId: string) {
    return this.jobs.update(jobId, { finishedAt: new Date() });
  }

  private withDuration<
    T extends {
      startedAt?: Date | string | null;
      finishedAt?: Date | string | null;
      createdAt: Date | string;
      updatedAt: Date | string;
      status: string;
    },
  >(job: T) {
    const toMs = (value: Date | string | null | undefined) => {
      if (value == null) return null;
      const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
      return Number.isFinite(ms) ? ms : null;
    };
    const terminal =
      job.status === "succeeded" ||
      job.status === "failed" ||
      job.status === "cancelled";
    // In-flight jobs: leave duration unset so the client can tick from 0.
    if (!terminal) {
      return { ...job, durationMs: null as number | null };
    }
    const start = toMs(job.startedAt) ?? toMs(job.createdAt) ?? Date.now();
    const end =
      toMs(job.finishedAt) ?? toMs(job.updatedAt) ?? Date.now();
    const durationMs = Math.max(0, end - start);
    return { ...job, durationMs };
  }

  /** Backfill channel/model names for legacy rows that only stored input.modelId. */
  private async enrichMany(rows: Array<JobWithAssets | JobListRow>) {
    const missingIds = [
      ...new Set(
        rows
          .filter((j) => !j.modelName || !j.channelName)
          .map((j) => {
            if (j.modelId) return j.modelId;
            const input = j.input as { modelId?: string } | null;
            return input?.modelId;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const models =
      missingIds.length === 0
        ? []
        : await this.models.find({
            where: { id: In(missingIds) },
            relations: ["channel"],
          });
    const byId = new Map(models.map((m) => [m.id, m]));

    // Backfill referenceUrls from referenceAssetIds for feed thumbnails
    const refIdPairs: { userId: string; id: string }[] = [];
    for (const job of rows) {
      const input = job.input as {
        referenceAssetIds?: string[];
        referenceUrls?: string[];
      } | null;
      const existing = input?.referenceUrls?.filter(Boolean) ?? [];
      if (existing.length > 0) continue;
      for (const id of input?.referenceAssetIds ?? []) {
        if (id) refIdPairs.push({ userId: job.userId, id });
      }
    }
    const refUrlById = new Map<string, string>();
    if (refIdPairs.length > 0) {
      const byUser = new Map<string, string[]>();
      for (const p of refIdPairs) {
        const list = byUser.get(p.userId) ?? [];
        list.push(p.id);
        byUser.set(p.userId, list);
      }
      for (const [userId, ids] of byUser) {
        const assets = await this.assets.findByIds(userId, [
          ...new Set(ids),
        ]);
        for (const a of assets) refUrlById.set(a.id, a.url);
      }
    }

    return rows.map((job) => {
      const input = job.input as {
        modelId?: string;
        referenceAssetIds?: string[];
        referenceUrls?: string[];
      } | null;
      let nextInput = job.input;
      const existingUrls = input?.referenceUrls?.filter(Boolean) ?? [];
      if (existingUrls.length === 0 && input?.referenceAssetIds?.length) {
        const urls = input.referenceAssetIds
          .map((id) => refUrlById.get(id))
          .filter((u): u is string => Boolean(u));
        if (urls.length > 0) {
          nextInput = { ...input, referenceUrls: urls };
        }
      }

      const base =
        nextInput === job.input
          ? job
          : { ...job, input: nextInput };

      if (base.modelName && base.channelName) {
        return this.withDuration(base);
      }
      const inputModelId = input?.modelId;
      const mid = base.modelId || inputModelId;
      const model = mid ? byId.get(mid) : undefined;
      return this.withDuration({
        ...base,
        modelId: base.modelId ?? model?.id ?? null,
        modelName: base.modelName ?? model?.name ?? null,
        channelId: base.channelId ?? model?.channelId ?? null,
        channelName: base.channelName ?? model?.channel.name ?? null,
        platform: base.platform ?? model?.channel.platform ?? null,
      });
    });
  }
}
