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
import {
  normalizePage,
  type PaginatedResult,
} from "../../common/dto/pagination-query.dto";
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
    return (
      job.kind === JobKind.image ||
      job.kind === JobKind.video ||
      job.kind === JobKind.llm
    );
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
      toolKinds: [JobKind.image, JobKind.video, JobKind.llm],
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

  /**
   * Register already-uploaded assets as a succeeded studio job (crop / trim / etc).
   * No queue — results show immediately in the creation feed.
   */
  async createLocal(userId: string, body: unknown) {
    const raw = (body ?? {}) as {
      kind?: string;
      prompt?: string;
      assetIds?: unknown;
      localTool?: string;
      layout?: { rows?: unknown; cols?: unknown };
      tiles?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const kindRaw = String(raw.kind ?? "").trim();
    const kind =
      kindRaw === "image" || kindRaw === "video" || kindRaw === "audio"
        ? kindRaw
        : null;
    if (!kind) {
      throw new BadRequestException("kind 须为 image / video / audio");
    }
    const prompt = String(raw.prompt ?? "").trim() || "本地编辑";
    const assetIds = Array.isArray(raw.assetIds)
      ? raw.assetIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (!assetIds.length) {
      throw new BadRequestException("缺少素材");
    }

    const localTool = String(raw.localTool ?? "").trim() || undefined;
    const layoutRows = Math.floor(Number(raw.layout?.rows));
    const layoutCols = Math.floor(Number(raw.layout?.cols));
    const layout =
      Number.isFinite(layoutRows) &&
      Number.isFinite(layoutCols) &&
      layoutRows >= 1 &&
      layoutCols >= 1 &&
      layoutRows <= 6 &&
      layoutCols <= 6
        ? { rows: layoutRows, cols: layoutCols }
        : undefined;
    const tiles = normalizeSplitTiles(raw.tiles, assetIds);
    const width = Math.floor(Number(raw.width));
    const height = Math.floor(Number(raw.height));
    const size =
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
        ? { width, height }
        : undefined;

    const now = new Date();
    const job = await this.jobs.save(
      this.jobs.create({
        userId,
        kind: kind as JobKind,
        status: JobStatus.succeeded,
        progress: 100,
        startedAt: now,
        finishedAt: now,
        input: {
          prompt,
          n: assetIds.length,
          localEdit: true,
          ...(localTool ? { localTool } : {}),
          ...(layout ? { layout } : {}),
          ...(size ? size : {}),
        },
        modelId: null,
        modelName: "本地编辑",
        channelId: null,
        channelName: null,
        platform: null,
        canvasProjectId: null,
        canvasNodeId: null,
        result: {
          assetIds,
          ...(layout ? { layout } : {}),
          ...(tiles ? { tiles } : {}),
        },
      }),
    );

    const linked = await this.assets.linkToJob(userId, assetIds, job.id);
    await this.jobs.update(job.id, {
      result: {
        // Keep upload / slice order (row-major for 切图) — never reshuffle.
        assetIds: linked.map((a) => a.id),
        urls: linked.map((a) => a.url),
        ...(layout ? { layout } : {}),
        ...(tiles ? { tiles } : {}),
      },
    });

    this.realtime.emitJob(userId, "job:completed", {
      jobId: job.id,
      kind: job.kind,
      status: JobStatus.succeeded,
    });

    return this.get(userId, job.id);
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
   * Ordered by createdAt so studio chat keeps click/submit order.
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
        const ms = Date.parse(String(job.createdAt));
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

  async listAll(query: {
    page?: number;
    pageSize?: number;
    /** Legacy cap; mapped to pageSize when pageSize omitted. */
    take?: number;
    keyword?: string;
    status?: string;
    kind?: string;
  } = {}) {
    const legacySize =
      query.take != null && query.pageSize == null
        ? Math.min(Math.max(Number(query.take) || 100, 1), 100)
        : undefined;
    const { page, pageSize, skip } = normalizePage(
      query.page,
      query.pageSize ?? legacySize,
    );

    const applyFilters = (
      qb: SelectQueryBuilder<Job>,
    ): SelectQueryBuilder<Job> => {
      const status = query.status?.trim();
      if (status) {
        qb.andWhere("job.status = :status", { status });
      }
      const kind = query.kind?.trim();
      if (kind) {
        qb.andWhere("job.kind = :kind", { kind });
      }
      const keyword = query.keyword?.trim();
      if (keyword) {
        qb.andWhere(
          `(
            job.id LIKE :kw
            OR user.username LIKE :kw
            OR IFNULL(job.error, '') LIKE :kw
            OR IFNULL(job.remoteTaskId, '') LIKE :kw
            OR IFNULL(job.modelName, '') LIKE :kw
            OR IFNULL(job.channelName, '') LIKE :kw
            OR IFNULL(job.platform, '') LIKE :kw
            OR CAST(job.input AS CHAR) LIKE :kw
          )`,
          { kw: `%${keyword}%` },
        );
      }
      return qb;
    };

    const total = await applyFilters(
      this.jobs
        .createQueryBuilder("job")
        .leftJoin("job.user", "user"),
    ).getCount();

    const rows = await applyFilters(
      this.jobs
        .createQueryBuilder("job")
        .leftJoinAndSelect("job.user", "user")
        .leftJoinAndSelect("job.assets", "assets")
        .orderBy("job.createdAt", "DESC")
        .skip(skip)
        .take(pageSize),
    ).getMany();

    const items = await this.enrichMany(
      rows.map((row) => ({
        ...row,
        user: row.user
          ? { id: row.user.id, username: row.user.username }
          : undefined,
      })) as JobListRow[],
    );
    return { items, total, page, pageSize } satisfies PaginatedResult<
      (typeof items)[number]
    >;
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
    const job = await this.jobs.findOne({
      where: { id, userId },
      relations: ["assets"],
    });
    if (!job) throw new NotFoundException("任务不存在");

    const assetIds = (job.assets ?? []).map((a) => a.id);
    // Also pick ids from result in case relation is incomplete.
    const resultIds = Array.isArray(
      (job.result as { assetIds?: unknown } | null)?.assetIds,
    )
      ? ((job.result as { assetIds: unknown[] }).assetIds ?? [])
          .map((aid) => String(aid || "").trim())
          .filter(Boolean)
      : [];
    const allAssetIds = [...new Set([...assetIds, ...resultIds])];

    if (allAssetIds.length) {
      await this.assets.removeOwnedAndPurgeStorage(userId, allAssetIds);
    }

    await this.jobs.remove(job);
    return { ok: true, id, removedAssets: allAssetIds.length };
  }

  /** Delete one output tile; removes the job when no outputs remain. */
  async removeAsset(userId: string, jobId: string, assetId: string) {
    const job = await this.jobs.findOne({
      where: { id: jobId, userId },
      relations: ["assets"],
    });
    if (!job) throw new NotFoundException("任务不存在");

    const targetId = String(assetId || "").trim();
    if (!targetId) throw new BadRequestException("缺少素材");

    const result = (job.result ?? {}) as {
      assetIds?: unknown;
      urls?: unknown;
      tiles?: unknown;
      layout?: unknown;
    };
    const resultIds = Array.isArray(result.assetIds)
      ? result.assetIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    const linkedIds = (job.assets ?? []).map((a) => a.id);
    const allIds = [...new Set([...resultIds, ...linkedIds])];
    if (!allIds.includes(targetId)) {
      throw new NotFoundException("该任务下没有此素材");
    }

    await this.assets.removeOwnedAndPurgeStorage(userId, [targetId]);

    const remainingIds = allIds.filter((id) => id !== targetId);
    if (!remainingIds.length) {
      await this.jobs.remove(job);
      return { ok: true, jobId, assetId: targetId, jobRemoved: true as const };
    }

    const remainingAssets = (job.assets ?? []).filter((a) => a.id !== targetId);
    const byId = new Map(remainingAssets.map((a) => [a.id, a]));
    const orderedIds = resultIds.filter((id) => id !== targetId);
    for (const id of remainingIds) {
      if (!orderedIds.includes(id)) orderedIds.push(id);
    }
    const urls = orderedIds
      .map((id) => byId.get(id)?.url)
      .filter((u): u is string => Boolean(u));

    let tiles: Array<{ assetId: string; row: number; col: number }> | undefined;
    if (Array.isArray(result.tiles)) {
      const next = normalizeSplitTiles(result.tiles, orderedIds);
      tiles = next;
    }

    const input = {
      ...(job.input ?? {}),
      n: orderedIds.length,
    };
    // Rebuild without spreading loosely-typed fields — TypeORM's
    // QueryDeepPartialEntity rejects `unknown` (e.g. layout).
    const nextResult: Record<string, unknown> = {
      assetIds: orderedIds,
      urls,
    };
    if (tiles) nextResult.tiles = tiles;
    if (result.layout !== undefined) nextResult.layout = result.layout;

    await this.jobs.update(jobId, {
      input,
      result: nextResult as never,
    });

    return this.get(userId, jobId);
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

      const orderedAssets = orderAssetsByResult(
        job.assets ?? [],
        job.result,
      );

      const base =
        nextInput === job.input && orderedAssets === job.assets
          ? job
          : { ...job, input: nextInput, assets: orderedAssets };

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

/** Keep feed / grid tiles in the same order as `result.assetIds` (e.g. 切图 row-major).
 * Prefer explicit `result.tiles` row/col, then repair via `joyai-split-R-C` names.
 */
function orderAssetsByResult(
  assets: Asset[],
  result: Record<string, unknown> | null | undefined,
): Asset[] {
  if (!assets.length) return assets;
  const byTiles = orderAssetsByTiles(assets, result);
  if (byTiles) return byTiles;

  const ids = Array.isArray(result?.assetIds)
    ? (result.assetIds as unknown[])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    : [];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered: Asset[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const hit = byId.get(id);
    if (!hit || seen.has(id)) continue;
    ordered.push(hit);
    seen.add(id);
  }
  for (const a of assets) {
    if (!seen.has(a.id)) ordered.push(a);
  }
  return orderSplitAssetsByName(ordered);
}

function orderAssetsByTiles(
  assets: Asset[],
  result: Record<string, unknown> | null | undefined,
): Asset[] | null {
  const tiles = normalizeSplitTiles(result?.tiles, assets.map((a) => a.id));
  if (!tiles?.length) return null;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered: Asset[] = [];
  const seen = new Set<string>();
  for (const tile of tiles) {
    const hit = byId.get(tile.assetId);
    if (!hit || seen.has(tile.assetId)) continue;
    ordered.push(hit);
    seen.add(tile.assetId);
  }
  for (const a of assets) {
    if (!seen.has(a.id)) ordered.push(a);
  }
  return ordered.length ? ordered : null;
}

function normalizeSplitTiles(
  raw: unknown,
  assetIds: string[],
): Array<{ assetId: string; row: number; col: number }> | undefined {
  if (!Array.isArray(raw) || !raw.length) return undefined;
  const idSet = new Set(assetIds);
  const tiles: Array<{ assetId: string; row: number; col: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rowRaw = item as { assetId?: unknown; row?: unknown; col?: unknown };
    const assetId = String(rowRaw.assetId ?? "").trim();
    const row = Math.floor(Number(rowRaw.row));
    const col = Math.floor(Number(rowRaw.col));
    if (!assetId || !idSet.has(assetId)) continue;
    if (!Number.isFinite(row) || !Number.isFinite(col) || row < 0 || col < 0) {
      continue;
    }
    tiles.push({ assetId, row, col });
  }
  if (tiles.length < 2) return undefined;
  return tiles.sort((a, b) => a.row - b.row || a.col - b.col);
}

/** Prefer filenames like joyai-split-1-2.png → row-major grid order. */
function orderSplitAssetsByName(assets: Asset[]): Asset[] {
  if (assets.length < 2) return assets;
  const scored: {
    asset: Asset;
    index: number;
    row: number;
    col: number;
  }[] = [];
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]!;
    const name = splitAssetLabel(asset);
    const match = name.match(/joyai-split-(\d+)-(\d+)/i);
    if (!match) return assets;
    scored.push({
      asset,
      index,
      row: Number(match[1]) - 1,
      col: Number(match[2]) - 1,
    });
  }
  return scored
    .sort((a, b) => a.row - b.row || a.col - b.col || a.index - b.index)
    .map((s) => s.asset);
}

function splitAssetLabel(asset: Asset): string {
  const meta = (asset as Asset & { meta?: Record<string, unknown> | null }).meta;
  const original =
    typeof meta?.originalName === "string" ? meta.originalName : "";
  const url = String(asset.url || "");
  return `${original} ${url}`;
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
