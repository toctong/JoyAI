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
import { CameraMove } from "../../database/entities/camera-move.entity";

export type CameraMoveListQuery = {
  enabled?: boolean;
  q?: string;
  category?: string;
};

export type CameraMoveInput = {
  slug: string;
  label: string;
  prompt: string;
  thumbUrl?: string | null;
  category?: string;
  exclusiveGroup?: string | null;
  enabled?: boolean;
  sortOrder?: number;
};

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

@Injectable()
export class CameraMovesService {
  constructor(
    @InjectRepository(CameraMove)
    private readonly moves: Repository<CameraMove>,
  ) {}

  async listPublic(category?: string) {
    const qb = this.moves
      .createQueryBuilder("m")
      .where("m.enabled = :enabled", { enabled: true })
      .orderBy("m.sortOrder", "ASC")
      .addOrderBy("m.createdAt", "ASC");
    const cat = category?.trim();
    if (cat && cat !== "全部") {
      qb.andWhere("m.category = :category", { category: cat });
    }
    return qb.getMany();
  }

  async listCategories() {
    const rows = await this.moves
      .createQueryBuilder("m")
      .select("m.category", "category")
      .where("m.enabled = :enabled", { enabled: true })
      .groupBy("m.category")
      .orderBy("m.category", "ASC")
      .getRawMany<{ category: string }>();
    return rows.map((r) => r.category).filter(Boolean);
  }

  async listAdmin(opts?: CameraMoveListQuery) {
    const qb = this.moves
      .createQueryBuilder("m")
      .orderBy("m.sortOrder", "ASC")
      .addOrderBy("m.createdAt", "ASC");
    if (opts?.enabled !== undefined) {
      qb.andWhere("m.enabled = :enabled", { enabled: opts.enabled });
    }
    const cat = opts?.category?.trim();
    if (cat) {
      qb.andWhere("m.category = :category", { category: cat });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere(
        "(m.slug LIKE :q OR m.label LIKE :q OR m.prompt LIKE :q OR m.category LIKE :q)",
        { q: `%${q}%` },
      );
    }
    return qb.getMany();
  }

  async get(id: string) {
    const row = await this.moves.findOne({ where: { id } });
    if (!row) throw new NotFoundException("运镜不存在");
    return row;
  }

  async create(input: CameraMoveInput) {
    const slug = slugify(input.slug);
    const label = input.label?.trim();
    const prompt = input.prompt?.trim();
    if (!slug) throw new BadRequestException("slug 必填");
    if (!label) throw new BadRequestException("label 必填");
    if (!prompt) throw new BadRequestException("prompt 必填");
    const exists = await this.moves.findOne({ where: { slug } });
    if (exists) throw new BadRequestException("slug 已存在");
    const row = this.moves.create({
      slug,
      label,
      prompt,
      thumbUrl: input.thumbUrl?.trim() || null,
      category: input.category?.trim() || "基础控制",
      exclusiveGroup: input.exclusiveGroup?.trim() || null,
      enabled: input.enabled !== false,
      sortOrder: input.sortOrder ?? 100,
    });
    return this.moves.save(row);
  }

  async update(id: string, input: Partial<CameraMoveInput>) {
    const row = await this.get(id);
    if (input.slug !== undefined) {
      const slug = slugify(input.slug);
      if (!slug) throw new BadRequestException("slug 无效");
      if (slug !== row.slug) {
        const exists = await this.moves.findOne({ where: { slug } });
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
      row.thumbUrl = input.thumbUrl?.trim() || null;
    }
    if (input.category !== undefined) {
      row.category = input.category.trim() || "基础控制";
    }
    if (input.exclusiveGroup !== undefined) {
      row.exclusiveGroup = input.exclusiveGroup?.trim() || null;
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    return this.moves.save(row);
  }

  async remove(id: string) {
    const row = await this.get(id);
    await this.moves.remove(row);
    return { ok: true };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.moves.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return makeAdminExport(
      "camera-moves",
      rows.map((r) => ({
        slug: r.slug,
        label: r.label,
        prompt: r.prompt,
        thumbUrl: r.thumbUrl,
        category: r.category,
        exclusiveGroup: r.exclusiveGroup,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      })),
    );
  }

  async importItems(body: unknown) {
    let raw: Array<Partial<CameraMoveInput> & { slug?: string }>;
    try {
      raw = parseAdminImportItems(body, "camera-moves");
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
      if (!slug || !label || !prompt) continue;
      const existing = await this.moves.findOne({ where: { slug } });
      const payload = {
        label,
        prompt,
        thumbUrl: item.thumbUrl?.trim() || null,
        category: String(item.category ?? "基础控制").trim() || "基础控制",
        exclusiveGroup: item.exclusiveGroup?.trim() || null,
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder) || 100,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.moves.save(existing);
        updated += 1;
      } else {
        await this.moves.save(this.moves.create({ slug, ...payload }));
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }
}
