import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  makeAdminExport,
  parseAdminImportItems,
} from "../../common/admin-export";
import { CATALOG_TTL_MS, TtlCache } from "../../common/ttl-cache";
import { InspireBanner } from "../../database/entities/inspire-banner.entity";

export type InspireBannerInput = {
  title: string;
  subtitle?: string | null;
  coverUrl: string;
  coverKind?: "image" | "video";
  posterUrl?: string | null;
  ctaLabel?: string | null;
  href?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

@Injectable()
export class InspireBannersService {
  private readonly publicCache = new TtlCache<InspireBanner[]>(CATALOG_TTL_MS);

  constructor(
    @InjectRepository(InspireBanner)
    private readonly banners: Repository<InspireBanner>,
  ) {}

  private bustPublicCache() {
    this.publicCache.clear();
  }

  /** Public inspire carousel — enabled only. */
  async listPublic() {
    const hit = this.publicCache.get();
    if (hit) return hit;
    const rows = await this.banners.find({
      where: { enabled: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    this.publicCache.set(rows);
    return rows;
  }

  async listAdmin(opts?: { enabled?: boolean; q?: string }) {
    const qb = this.banners
      .createQueryBuilder("b")
      .orderBy("b.sortOrder", "ASC")
      .addOrderBy("b.createdAt", "ASC");
    if (opts?.enabled !== undefined) {
      qb.andWhere("b.enabled = :enabled", { enabled: opts.enabled });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere("(b.title LIKE :q OR b.subtitle LIKE :q)", { q: `%${q}%` });
    }
    return qb.getMany();
  }

  async get(id: string) {
    const row = await this.banners.findOne({ where: { id } });
    if (!row) throw new NotFoundException("横幅不存在");
    return row;
  }

  async create(input: InspireBannerInput) {
    this.bustPublicCache();
    const title = input.title?.trim();
    const coverUrl = input.coverUrl?.trim();
    if (!title) throw new BadRequestException("title 必填");
    if (!coverUrl) throw new BadRequestException("coverUrl 必填");
    const row = this.banners.create({
      title,
      subtitle: input.subtitle?.trim() || null,
      coverUrl,
      coverKind: input.coverKind === "video" ? "video" : "image",
      posterUrl: input.posterUrl?.trim() || null,
      ctaLabel: input.ctaLabel?.trim() || null,
      href: input.href?.trim() || null,
      enabled: input.enabled !== false,
      sortOrder: input.sortOrder ?? 100,
    });
    return this.banners.save(row);
  }

  async update(id: string, input: Partial<InspireBannerInput>) {
    this.bustPublicCache();
    const row = await this.get(id);
    if (input.title !== undefined) {
      const title = input.title.trim();
      if (!title) throw new BadRequestException("title 无效");
      row.title = title;
    }
    if (input.subtitle !== undefined) {
      row.subtitle = input.subtitle?.trim() || null;
    }
    if (input.coverUrl !== undefined) {
      const coverUrl = input.coverUrl.trim();
      if (!coverUrl) throw new BadRequestException("coverUrl 无效");
      row.coverUrl = coverUrl;
    }
    if (input.coverKind !== undefined) {
      row.coverKind = input.coverKind === "video" ? "video" : "image";
    }
    if (input.posterUrl !== undefined) {
      row.posterUrl = input.posterUrl?.trim() || null;
    }
    if (input.ctaLabel !== undefined) {
      row.ctaLabel = input.ctaLabel?.trim() || null;
    }
    if (input.href !== undefined) {
      row.href = input.href?.trim() || null;
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    return this.banners.save(row);
  }

  async remove(id: string) {
    this.bustPublicCache();
    const row = await this.get(id);
    await this.banners.remove(row);
    return { ok: true };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.banners.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return makeAdminExport(
      "inspire-banners",
      rows.map((r) => ({
        title: r.title,
        subtitle: r.subtitle,
        coverUrl: r.coverUrl,
        coverKind: r.coverKind,
        posterUrl: r.posterUrl,
        ctaLabel: r.ctaLabel,
        href: r.href,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      })),
    );
  }

  async importItems(body: unknown) {
    this.bustPublicCache();
    let raw: Array<Partial<InspireBannerInput>>;
    try {
      raw = parseAdminImportItems(body, "inspire-banners");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const title = String(item.title ?? "").trim();
      const coverUrl = String(item.coverUrl ?? "").trim();
      if (!title || !coverUrl) continue;
      const existing = await this.banners.findOne({ where: { title } });
      const payload = {
        title,
        subtitle: item.subtitle?.trim() || null,
        coverUrl,
        coverKind: (item.coverKind === "video" ? "video" : "image") as
          | "image"
          | "video",
        posterUrl: item.posterUrl?.trim() || null,
        ctaLabel: item.ctaLabel?.trim() || null,
        href: item.href?.trim() || null,
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder) || 100,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.banners.save(existing);
        updated += 1;
      } else {
        await this.banners.save(this.banners.create(payload));
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }
}
