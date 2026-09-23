import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@dataui/crud-typeorm";
import { In, Repository } from "typeorm";
import { AuditLog } from "../../database/entities/audit-log.entity";
import { User } from "../../database/entities/user.entity";

export type AuditListItem = {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  createdAt: Date;
};

@Injectable()
export class AuditService extends TypeOrmCrudService<AuditLog> {
  constructor(
    @InjectRepository(AuditLog) repo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {
    super(repo);
  }

  /** Fire-and-forget safe: never throws to callers. */
  async record(
    userId: string | null | undefined,
    action: string,
    detail?: Record<string, unknown> | null,
  ) {
    try {
      await this.repo.save(
        this.repo.create({
          userId: userId ?? null,
          action,
          detail: detail ?? null,
        }),
      );
    } catch {
      // Audit must not break primary flows
    }
  }

  async list(opts: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    action?: string;
  }): Promise<{
    items: AuditListItem[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const qb = this.repo
      .createQueryBuilder("a")
      .orderBy("a.createdAt", "DESC")
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (opts.action?.trim()) {
      qb.andWhere("a.action = :action", { action: opts.action.trim() });
    }

    const kw = opts.keyword?.trim();
    if (kw) {
      qb.andWhere(
        `(a.action LIKE :kw OR a.userId LIKE :kw OR CAST(a.detail AS CHAR) LIKE :kw)`,
        { kw: `%${kw}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();
    const userIds = [
      ...new Set(rows.map((r) => r.userId).filter(Boolean) as string[]),
    ];
    const nameMap = new Map<string, string>();
    if (userIds.length) {
      const users = await this.users.find({
        where: { id: In(userIds) },
        select: ["id", "username"],
      });
      for (const u of users) nameMap.set(u.id, u.username);
    }

    return {
      items: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        username: r.userId ? (nameMap.get(r.userId) ?? null) : null,
        action: r.action,
        detail: r.detail,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }
}
