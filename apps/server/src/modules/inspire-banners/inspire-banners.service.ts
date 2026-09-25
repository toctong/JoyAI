import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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

const SEED: Array<Omit<InspireBannerInput, "enabled"> & { sortOrder: number }> =
  [
    {
      title: "FrameRally 探索开场",
      subtitle: "电影级氛围 · 写实摄影融合绘画质感",
      coverUrl: "/inspire/hero-01.webp",
      coverKind: "image",
      ctaLabel: "免费体验",
      href: "/studio",
      sortOrder: 10,
    },
    {
      title: "无限画布",
      subtitle: "Agent 驱动的多模态创作空间",
      coverUrl: "/inspire/hero-02.webp",
      coverKind: "image",
      ctaLabel: "打开画布",
      href: "/canvas",
      sortOrder: 20,
    },
    {
      title: "漫剧工作台",
      subtitle: "分镜到成片，一条创作链路",
      coverUrl: "/inspire/hero-03.webp",
      coverKind: "image",
      ctaLabel: "开始漫剧",
      href: "/manju",
      sortOrder: 30,
    },
  ];

@Injectable()
export class InspireBannersService implements OnModuleInit {
  constructor(
    @InjectRepository(InspireBanner)
    private readonly banners: Repository<InspireBanner>,
  ) {}

  async onModuleInit() {
    const count = await this.banners.count();
    if (count > 0) return;
    for (const seed of SEED) {
      await this.banners.save(
        this.banners.create({
          ...seed,
          subtitle: seed.subtitle ?? null,
          ctaLabel: seed.ctaLabel ?? null,
          href: seed.href ?? null,
          coverKind: seed.coverKind ?? "image",
          enabled: true,
        }),
      );
    }
  }

  /** Public inspire carousel — enabled only. */
  async listPublic() {
    return this.banners.find({
      where: { enabled: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
  }

  async listAdmin(opts?: { enabled?: boolean; q?: string }) {
    const qb = this.banners.createQueryBuilder("b").orderBy("b.sortOrder", "ASC").addOrderBy("b.createdAt", "ASC");
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
    const row = await this.get(id);
    await this.banners.remove(row);
    return { ok: true };
  }
}
