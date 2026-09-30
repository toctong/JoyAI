import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  SystemLog,
  type SystemLogLevel,
} from "../../database/entities/system-log.entity";

export type SystemLogWriteInput = {
  level: SystemLogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown> | null;
  stack?: string | null;
  userId?: string | null;
};

export type SystemLogListItem = {
  id: string;
  level: SystemLogLevel;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
  stack: string | null;
  userId: string | null;
  createdAt: Date;
};

/** Levels persisted by default (debug is opt-in / never from hot paths). */
const PERSIST_LEVELS = new Set<SystemLogLevel>(["error", "warn", "info"]);

@Injectable()
export class SystemLogService {
  private readonly logger = new Logger(SystemLogService.name);

  constructor(
    @InjectRepository(SystemLog)
    private readonly repo: Repository<SystemLog>,
  ) {}

  /** Fire-and-forget: never throws to callers. */
  write(input: SystemLogWriteInput) {
    void this.writeAsync(input);
  }

  error(
    source: string,
    message: string,
    opts?: Omit<SystemLogWriteInput, "level" | "source" | "message">,
  ) {
    this.write({ level: "error", source, message, ...opts });
  }

  warn(
    source: string,
    message: string,
    opts?: Omit<SystemLogWriteInput, "level" | "source" | "message">,
  ) {
    this.write({ level: "warn", source, message, ...opts });
  }

  info(
    source: string,
    message: string,
    opts?: Omit<SystemLogWriteInput, "level" | "source" | "message">,
  ) {
    this.write({ level: "info", source, message, ...opts });
  }

  private async writeAsync(input: SystemLogWriteInput) {
    try {
      const level = input.level;
      if (!PERSIST_LEVELS.has(level) && level !== "debug") return;
      // Skip debug unless explicitly enabled later via env.
      if (level === "debug" && process.env.SYSTEM_LOG_DEBUG !== "1") return;

      const message = clip(input.message, 4000);
      if (!message) return;

      await this.repo.save(
        this.repo.create({
          level,
          source: clip(input.source || "app", 64),
          message,
          context: sanitizeContext(input.context ?? null),
          stack: input.stack ? clip(input.stack, 8000) : null,
          userId: input.userId ?? null,
        }),
      );
    } catch (e) {
      this.logger.warn(
        `system_log write failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async list(opts: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    level?: string;
    source?: string;
  }): Promise<{
    items: SystemLogListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const qb = this.repo
      .createQueryBuilder("l")
      .orderBy("l.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const level = opts.level?.trim().toLowerCase();
    if (level && level !== "all") {
      qb.andWhere("l.level = :level", { level });
    }

    const source = opts.source?.trim();
    if (source && source !== "all") {
      qb.andWhere("l.source = :source", { source });
    }

    const kw = opts.keyword?.trim();
    if (kw) {
      qb.andWhere(
        `(l.message LIKE :kw OR l.source LIKE :kw OR CAST(l.context AS CHAR) LIKE :kw OR l.stack LIKE :kw)`,
        { kw: `%${kw}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => ({
        id: r.id,
        level: r.level,
        source: r.source,
        message: r.message,
        context: r.context,
        stack: r.stack,
        userId: r.userId,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async listSources(limit = 40): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder("l")
      .select("l.source", "source")
      .distinct(true)
      .orderBy("l.source", "ASC")
      .limit(limit)
      .getRawMany<{ source: string }>();
    return rows.map((r) => r.source).filter(Boolean);
  }
}

function clip(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function sanitizeContext(
  ctx: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!ctx) return null;
  try {
    const raw = JSON.stringify(ctx);
    if (raw.length > 8000) {
      return { truncated: true, preview: `${raw.slice(0, 4000)}…` };
    }
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { note: "context_serialize_failed" };
  }
}
