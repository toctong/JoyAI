import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Queue } from "bullmq";
import { In, IsNull, Repository, type SelectQueryBuilder } from "typeorm";
import { CreateJobSchema, QUEUE } from "@joyai/shared";
import { Job } from "../../database/entities/job.entity";
import { Model } from "../../database/entities/model.entity";
import { Asset } from "../../database/entities/asset.entity";
import { User } from "../../database/entities/user.entity";
import { JobKind, JobStatus } from "../../database/enums";
import { ChannelsService } from "../channels/channels.service";
import { AssetsService } from "../assets/assets.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

type JobWithAssets = Job & { assets: Asset[] };
type JobListRow = Omit<Job, "assignId"> & {
  assets: Asset[];
  user?: Pick<User, "id" | "username">;
};

function inputId(
  input: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = input?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 创作 / 画布 / 漫剧 / AI 工具各查各的。未传 scope 时不按产品裁剪。 */
function matchesJobScope(
  job: {
    kind: string;
    canvasProjectId?: string | null;
    input?: Record<string, unknown> | null;
  },
  scope: string | undefined,
  ids: {
    canvasProjectId?: string;
    manjuProjectId?: string;
    toolSlug?: string;
  },
) {
  const input = job.input ?? null;
  const canvasId = job.canvasProjectId || inputId(input, "canvasProjectId");
  const manjuId = inputId(input, "manjuProjectId");
  const slug = inputId(input, "toolSlug");
  const origin = canvasId
    ? "canvas"
    : manjuId
      ? "manju"
      : slug
        ? "tools"
        : null;

  if (!scope) return true;
  if (scope === "studio") {
    if (origin) return false;
    return job.kind === JobKind.image || job.kind === JobKind.video;
  }
  if (scope === "canvas") {
    if (origin !== "canvas") return false;
    if (ids.canvasProjectId && canvasId !== ids.canvasProjectId) return false;
    return true;
  }
  if (scope === "manju") {
    if (origin !== "manju") return false;
    if (ids.manjuProjectId && manjuId !== ids.manjuProjectId) return false;
    return true;
  }
  if (scope === "tools") {
    if (origin !== "tools") return false;
    if (ids.toolSlug && slug !== ids.toolSlug) return false;
    return job.kind === JobKind.image || job.kind === JobKind.video;
  }
  return false;
}

/** Narrow the SQL window before in-memory scope checks (json fields still need a second pass). */
function applyJobScopeQuery(
  qb: SelectQueryBuilder<Job>,
  scope: string | undefined,
  ids: {
    canvasProjectId?: string;
    manjuProjectId?: string;
    toolSlug?: string;
  },
) {
  if (!scope) return;
  if (scope === "studio") {
    qb.andWhere("job.canvasProjectId IS NULL");
    qb.andWhere("job.kind IN (:...studioKinds)", {
      studioKinds: [JobKind.image, JobKind.video],
    });
    // Exclude tools / manju jobs that only mark origin in JSON input.
    qb.andWhere(
      "(JSON_EXTRACT(job.input, '$.toolSlug') IS NULL OR JSON_TYPE(JSON_EXTRACT(job.input, '$.toolSlug')) = 'NULL')",
    );
    qb.andWhere(
      "(JSON_EXTRACT(job.input, '$.manjuProjectId') IS NULL OR JSON_TYPE(JSON_EXTRACT(job.input, '$.manjuProjectId')) = 'NULL')",
    );
    return;
  }
  if (scope === "canvas") {
    if (ids.canvasProjectId) {
      qb.andWhere(
        "(job.canvasProjectId = :canvasProjectId OR JSON_UNQUOTE(JSON_EXTRACT(job.input, '$.canvasProjectId')) = :canvasProjectId)",
        { canvasProjectId: ids.canvasProjectId },
      );
    } else {
      qb.andWhere(
        "(job.canvasProjectId IS NOT NULL OR (JSON_EXTRACT(job.input, '$.canvasProjectId') IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(job.input, '$.canvasProjectId')) <> 'NULL'))",
      );
    }
    return;
  }
  if (scope === "manju") {
    qb.andWhere("job.canvasProjectId IS NULL");
    if (ids.manjuProjectId) {
      qb.andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(job.input, '$.manjuProjectId')) = :manjuProjectId",
        { manjuProjectId: ids.manjuProjectId },
      );
    } else {
      qb.andWhere(
        "(JSON_EXTRACT(job.input, '$.manjuProjectId') IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(job.input, '$.manjuProjectId')) <> 'NULL')",
      );
    }
    return;
  }
  if (scope === "tools") {
    qb.andWhere("job.canvasProjectId IS NULL");
    qb.andWhere("job.kind IN (:...toolKinds)", {
      toolKinds: [JobKind.image, JobKind.video],
    });
    // MySQL JSON columns are binary — LIKE '%"toolSlug":"…"%' often matches nothing.
    if (ids.toolSlug) {
      qb.andWhere(
        "JSON_UNQUOTE(JSON_EXTRACT(job.input, '$.toolSlug')) = :toolSlug",
        { toolSlug: ids.toolSlug },
      );
    } else {
      qb.andWhere(
        "(JSON_EXTRACT(job.input, '$.toolSlug') IS NOT NULL AND JSON_TYPE(JSON_EXTRACT(job.input, '$.toolSlug')) <> 'NULL')",
      );
    }
  }
}

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Model) private readonly models: Repository<Model>,
    private readonly channels: ChannelsService,
    private readonly assets: AssetsService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(QUEUE.IMAGE) private readonly imageQueue: Queue,
    @InjectQueue(QUEUE.VIDEO_SUBMIT) private readonly videoSubmitQueue: Queue,
    @InjectQueue(QUEUE.VIDEO_POLL) private readonly videoPollQueue: Queue,
    @InjectQueue(QUEUE.LLM) private readonly llmQueue: Queue,
    @InjectQueue(QUEUE.AUDIO) private readonly audioQueue: Queue,
  ) {}

  async create(userId: string, body: unknown) {
    const parsed = CreateJobSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const { kind, input } = parsed.data;

    const model = await this.channels.resolveForKind(kind, input.modelId);
    const queue =
      kind === "image"
        ? this.imageQueue
        : kind === "llm"
          ? this.llmQueue
          : kind === "audio"
            ? this.audioQueue
            : this.videoSubmitQueue;

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
        canvasProjectId:
          "canvasProjectId" in input ? (input.canvasProjectId ?? null) : null,
        canvasNodeId:
          "canvasNodeId" in input ? (input.canvasNodeId ?? null) : null,
      }),
    );

    try {
      if (kind === "image") {
        await this.imageQueue.add(
          "generate",
          { jobId: job.id },
          { removeOnComplete: 100, removeOnFail: 200 },
        );
      } else if (kind === "llm") {
        await this.llmQueue.add(
          "generate",
          { jobId: job.id },
          { removeOnComplete: 100, removeOnFail: 200 },
        );
      } else if (kind === "audio") {
        await this.audioQueue.add(
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
   * Paged job feed. Scope is applied in SQL (not “load every job then filter”).
   * Windows are ordered by createdAt; a short in-memory pass still prefers
   * finishedAt for the studio chat cursor.
   */
  async list(
    userId: string,
    opts: {
      take?: number;
      before?: string;
      beforeId?: string;
      /** studio | canvas | manju | tools — 各查各的，不传则不按产品过滤（仅资产页走 /assets） */
      scope?: string;
      canvasProjectId?: string;
      manjuProjectId?: string;
      toolSlug?: string;
    } = {},
  ) {
    const take = Math.min(Math.max(Number(opts.take) || 30, 1), 100);
    const scope = opts.scope?.trim();
    const canvasProjectId = opts.canvasProjectId?.trim();
    const manjuProjectId = opts.manjuProjectId?.trim();
    const toolSlug = opts.toolSlug?.trim();
    const ids = { canvasProjectId, manjuProjectId, toolSlug };

    const beforeRaw = opts.before?.trim();
    const beforeMs = beforeRaw ? Date.parse(beforeRaw) : NaN;
    const beforeId = opts.beforeId?.trim() || "";
    const hasCursor = Number.isFinite(beforeMs);

    const batchSize = Math.min(Math.max(take * 2, 40), 120);
    const matched: Array<{ job: JobListRow; ms: number }> = [];
    let cursor: Date | undefined;

    for (let round = 0; round < 6 && matched.length <= take; round += 1) {
      const qb = this.jobs
        .createQueryBuilder("job")
        .leftJoinAndSelect("job.assets", "assets")
        .where("job.userId = :userId", { userId })
        .orderBy("job.createdAt", "DESC")
        .addOrderBy("job.id", "DESC")
        .take(batchSize);
      applyJobScopeQuery(qb, scope, ids);
      if (cursor) {
        qb.andWhere("job.createdAt < :cursor", { cursor });
      }
      const rows = await qb.getMany();
      if (!rows.length) break;

      const enriched = await this.enrichMany(rows);
      for (const job of enriched) {
        if (!matchesJobScope(job, scope, ids)) continue;
        const ms = Date.parse(String(job.finishedAt ?? job.createdAt));
        const time = Number.isFinite(ms) ? ms : 0;
        if (hasCursor) {
          if (time > beforeMs) continue;
          if (time === beforeMs && String(job.id).localeCompare(beforeId) >= 0) {
            continue;
          }
        }
        matched.push({ job, ms: time });
      }

      const last = rows[rows.length - 1];
      cursor = last?.createdAt ? new Date(last.createdAt) : undefined;
      if (rows.length < batchSize || !cursor) break;
    }

    matched.sort((a, b) => {
      if (a.ms !== b.ms) return b.ms - a.ms;
      return String(b.job.id).localeCompare(String(a.job.id));
    });

    const hasMore = matched.length > take;
    const pageDesc = hasMore ? matched.slice(0, take) : matched;
    const items = pageDesc.map((row) => row.job).reverse();
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

  /** Interrupt a queued/running job; workers check status before finalizing. */
  async cancel(userId: string, id: string) {
    const job = await this.jobs.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException("任务不存在");

    if (
      job.status === JobStatus.succeeded ||
      job.status === JobStatus.failed ||
      job.status === JobStatus.cancelled
    ) {
      return { ok: true, id, status: job.status };
    }

    await this.jobs.update(id, {
      status: JobStatus.cancelled,
      error: "已中断",
      progress: 100,
      finishedAt: new Date(),
    });

    await this.tryAbortQueues(id);

    this.realtime.emitJob(userId, "job:failed", {
      jobId: id,
      status: "cancelled",
      error: "已中断",
    });

    return { ok: true, id, status: "cancelled" as const };
  }

  private async tryAbortQueues(jobId: string) {
    const queues = [
      this.imageQueue,
      this.videoSubmitQueue,
      this.videoPollQueue,
      this.llmQueue,
    ];
    await Promise.all(
      queues.map(async (queue) => {
        try {
          const states = ["waiting", "delayed", "paused", "active"] as const;
          for (const state of states) {
            const batch = await queue.getJobs([state], 0, 200);
            for (const bullJob of batch) {
              if (bullJob.data?.jobId !== jobId) continue;
              try {
                await bullJob.remove();
              } catch {
                /* best effort — active workers still check cancelled status */
              }
            }
          }
        } catch {
          /* best effort */
        }
      }),
    );
  }

  async resolveReferenceUrls(
    userId: string,
    referenceAssetIds?: string[],
    referenceUrls?: string[],
  ) {
    const resolved = await this.resolveReferenceMedia(
      userId,
      referenceAssetIds,
      referenceUrls,
    );
    return resolved.map((r) => r.url);
  }

  /** Resolve refs with media kind (from asset metadata or URL heuristics). */
  async resolveReferenceMedia(
    userId: string,
    referenceAssetIds?: string[],
    referenceUrls?: string[],
  ): Promise<Array<{ url: string; kind: "image" | "video" | "audio" }>> {
    const seen = new Set<string>();
    const out: Array<{ url: string; kind: "image" | "video" | "audio" }> = [];
    const push = (raw?: string, kindHint?: string | null) => {
      const url = String(raw || "").trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      out.push({ url, kind: classifyRefMediaKind(url, kindHint) });
    };

    for (const u of referenceUrls ?? []) push(u);

    const ids = [...new Set((referenceAssetIds ?? []).filter(Boolean))];
    if (ids.length) {
      const assets = await this.assets.findByIds(userId, ids);
      const byId = new Map(assets.map((a) => [a.id, a]));
      for (const id of ids) {
        const a = byId.get(id);
        if (!a) continue;
        push(a.url, a.kind || a.mimeType);
      }
    }
    return out;
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

function classifyRefMediaKind(
  url: string,
  hint?: string | null,
): "image" | "video" | "audio" {
  const h = String(hint || "").toLowerCase();
  if (h.includes("video") || h.startsWith("video/")) return "video";
  if (h.includes("audio") || h.startsWith("audio/")) return "audio";
  if (h.includes("image") || h.startsWith("image/")) return "image";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)) return "audio";
  return "image";
}
