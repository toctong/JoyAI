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
import {
  StyleTemplate,
  type StyleSurface,
} from "../../database/entities/style-template.entity";

const SURFACES: StyleSurface[] = ["manju", "canvas"];

export type StyleListQuery = {
  enabled?: boolean;
  q?: string;
  surface?: StyleSurface;
};

export type StyleInput = {
  slug: string;
  label: string;
  prompt: string;
  thumbUrl: string;
  tone?: string;
  enabled?: boolean;
  sortOrder?: number;
  surfaces?: StyleSurface[];
};

function normalizeSurfaces(raw?: StyleSurface[] | null): StyleSurface[] {
  if (!raw?.length) return [...SURFACES];
  const set = new Set<StyleSurface>();
  for (const s of raw) {
    if (s === "manju" || s === "canvas") set.add(s);
  }
  return set.size ? [...set] : [...SURFACES];
}

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

@Injectable()
export class StylesService {
  constructor(
    @InjectRepository(StyleTemplate)
    private readonly styles: Repository<StyleTemplate>,
  ) {}

  async listPublic(surface?: StyleSurface) {
    const rows = await this.styles.find({
      where: { enabled: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    if (!surface) return rows;
    return rows.filter((r) => (r.surfaces ?? SURFACES).includes(surface));
  }

  async listAdmin(opts?: StyleListQuery) {
    const qb = this.styles
      .createQueryBuilder("s")
      .orderBy("s.sortOrder", "ASC")
      .addOrderBy("s.createdAt", "ASC");
    if (opts?.enabled !== undefined) {
      qb.andWhere("s.enabled = :enabled", { enabled: opts.enabled });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere(
        "(s.slug LIKE :q OR s.label LIKE :q OR s.prompt LIKE :q)",
        { q: `%${q}%` },
      );
    }
    const rows = await qb.getMany();
    if (!opts?.surface) return rows;
    return rows.filter((r) =>
      (r.surfaces ?? SURFACES).includes(opts.surface!),
    );
  }

  async get(id: string) {
    const row = await this.styles.findOne({ where: { id } });
    if (!row) throw new NotFoundException("风格不存在");
    return row;
  }

  async create(input: StyleInput) {
    const slug = slugify(input.slug);
    const label = input.label?.trim();
    const prompt = input.prompt?.trim();
    const thumbUrl = input.thumbUrl?.trim();
    if (!slug) throw new BadRequestException("slug 必填");
    if (!label) throw new BadRequestException("label 必填");
    if (!prompt) throw new BadRequestException("prompt 必填");
    if (!thumbUrl) throw new BadRequestException("thumbUrl 必填");

    const exists = await this.styles.findOne({ where: { slug } });
    if (exists) throw new BadRequestException("slug 已存在");

    const row = this.styles.create({
      slug,
      label,
      prompt,
      thumbUrl,
      tone: input.tone?.trim() || "cinematic",
      enabled: input.enabled !== false,
      sortOrder: input.sortOrder ?? 100,
      surfaces: normalizeSurfaces(input.surfaces),
    });
    return this.styles.save(row);
  }

  async update(id: string, input: Partial<StyleInput>) {
    const row = await this.get(id);
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (!slug) throw new BadRequestException("slug 无效");
      if (slug !== row.slug) {
        const exists = await this.styles.findOne({ where: { slug } });
        if (exists) throw new BadRequestException("slug 已存在");
        row.slug = slug;
      }
    }
    if (input.label !== undefined) {
      const label = input.label.trim();
      if (!label) throw new BadRequestException("label 无效");
      row.label = label;
    }
    if (input.prompt !== undefined) {
      const prompt = input.prompt.trim();
      if (!prompt) throw new BadRequestException("prompt 无效");
      row.prompt = prompt;
    }
    if (input.thumbUrl !== undefined) {
      const thumbUrl = input.thumbUrl.trim();
      if (!thumbUrl) throw new BadRequestException("thumbUrl 无效");
      row.thumbUrl = thumbUrl;
    }
    if (input.tone !== undefined) {
      row.tone = input.tone.trim() || "cinematic";
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    if (input.surfaces !== undefined) {
      row.surfaces = normalizeSurfaces(input.surfaces);
    }
    return this.styles.save(row);
  }

  async remove(id: string) {
    const row = await this.get(id);
    await this.styles.remove(row);
    return { ok: true };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.styles.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return makeAdminExport(
      "styles",
      rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        prompt: r.prompt,
        thumbUrl: r.thumbUrl,
        tone: r.tone,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
        surfaces: r.surfaces ?? [...SURFACES],
      })),
    );
  }

  async importItems(body: unknown) {
    let raw: Array<Partial<StyleInput> & { slug?: string }>;
    try {
      raw = parseAdminImportItems(body, "styles");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const slug = slugify(String(item.slug ?? ""));
      const label = String(item.label ?? "").trim();
      const prompt = String(item.prompt ?? "").trim();
      const thumbUrl = String(item.thumbUrl ?? "").trim();
      if (!slug || !label || !prompt || !thumbUrl) continue;
      const existing = await this.styles.findOne({ where: { slug } });
      const payload = {
        label,
        prompt,
        thumbUrl,
        tone: String(item.tone ?? "cinematic").trim() || "cinematic",
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder) || 100,
        surfaces: normalizeSurfaces(item.surfaces),
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.styles.save(existing);
        updated += 1;
      } else {
        await this.styles.save(this.styles.create({ slug, ...payload }));
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }
}
