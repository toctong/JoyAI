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
import { Skill, type SkillCategory } from "../../database/entities/skill.entity";
import {
  ANALYZE_ASSETS_SYSTEM,
  AUTHOR_PROMPTS_SYSTEM,
  CANVAS_TEXT_SYSTEM,
  MANJU_REVIEW_SYSTEM,
  NOVEL_ANALYZE_SYSTEM,
  PLAN_EPISODES_SYSTEM,
  PROMPT_OPTIMIZE_SYSTEM,
  REVERSE_PROMPT_SYSTEM,
  SCRIPT_PLAN_SYSTEM,
  SCRIPT_WRITE_SYSTEM,
  SERIES_MEMORY_SYSTEM,
} from "../jobs/llm-prompts";

export type SkillListQuery = {
  category?: SkillCategory;
  enabled?: boolean;
  q?: string;
};

export type CreateSkillInput = {
  slug: string;
  name: string;
  description?: string | null;
  category: SkillCategory;
  purpose: string;
  systemPrompt: string;
  enabled?: boolean;
  sortOrder?: number;
};

export type UpdateSkillInput = {
  name?: string;
  description?: string | null;
  category?: SkillCategory;
  purpose?: string;
  systemPrompt?: string;
  enabled?: boolean;
  sortOrder?: number;
};

const FALLBACK_BY_PURPOSE: Record<string, string> = {
  analyze_assets: ANALYZE_ASSETS_SYSTEM,
  script_plan: SCRIPT_PLAN_SYSTEM,
  split_shots: SCRIPT_PLAN_SYSTEM,
  author_prompts: AUTHOR_PROMPTS_SYSTEM,
  series_memory: SERIES_MEMORY_SYSTEM,
  plan_episodes: PLAN_EPISODES_SYSTEM,
  novel_analyze: NOVEL_ANALYZE_SYSTEM,
  manju_review: MANJU_REVIEW_SYSTEM,
  script_write: SCRIPT_WRITE_SYSTEM,
  reverse_prompt: REVERSE_PROMPT_SYSTEM,
  prompt_optimize: PROMPT_OPTIMIZE_SYSTEM,
  canvas_text: CANVAS_TEXT_SYSTEM,
};

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
  ) {}

  list(query: SkillListQuery = {}) {
    const qb = this.skills
      .createQueryBuilder("s")
      .orderBy("s.sortOrder", "ASC")
      .addOrderBy("s.createdAt", "ASC");

    if (query.category) {
      qb.andWhere("s.category = :category", { category: query.category });
    }
    if (query.enabled !== undefined) {
      qb.andWhere("s.enabled = :enabled", { enabled: query.enabled });
    }
    if (query.q?.trim()) {
      const q = `%${query.q.trim()}%`;
      qb.andWhere(
        "(s.name LIKE :q OR s.slug LIKE :q OR s.purpose LIKE :q OR s.description LIKE :q)",
        { q },
      );
    }
    return qb.getMany();
  }

  /** Enabled skills for product UIs — no systemPrompt. */
  async listPublic(query: { category?: SkillCategory } = {}) {
    const rows = await this.list({
      category: query.category,
      enabled: true,
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      category: row.category,
      purpose: row.purpose,
      builtin: row.builtin,
      sortOrder: row.sortOrder,
    }));
  }

  async get(id: string) {
    const row = await this.skills.findOne({ where: { id } });
    if (!row) throw new NotFoundException("技能不存在");
    return row;
  }

  async create(input: CreateSkillInput) {
    const slug = normalizeSlug(input.slug);
    const purpose = normalizePurpose(input.purpose);
    if (!slug) throw new BadRequestException("slug 无效");
    if (!purpose) throw new BadRequestException("purpose 无效");
    if (!input.systemPrompt?.trim()) {
      throw new BadRequestException("systemPrompt 不能为空");
    }

    const clash = await this.skills.findOne({ where: { slug } });
    if (clash) throw new BadRequestException("slug 已存在");

    return this.skills.save(
      this.skills.create({
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category,
        purpose,
        systemPrompt: input.systemPrompt.trim(),
        enabled: input.enabled ?? true,
        builtin: false,
        sortOrder: input.sortOrder ?? 100,
      }),
    );
  }

  async update(id: string, input: UpdateSkillInput) {
    const row = await this.get(id);

    if (input.name !== undefined) row.name = input.name.trim();
    if (input.description !== undefined) {
      row.description = input.description?.trim() || null;
    }
    if (input.category !== undefined) row.category = input.category;
    if (input.systemPrompt !== undefined) {
      const prompt = input.systemPrompt.trim();
      if (!prompt) throw new BadRequestException("systemPrompt 不能为空");
      row.systemPrompt = prompt;
    }
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;

    if (input.enabled !== undefined) row.enabled = input.enabled;

    if (input.purpose !== undefined) {
      const purpose = normalizePurpose(input.purpose);
      if (!purpose) throw new BadRequestException("purpose 无效");
      row.purpose = purpose;
    }

    row.builtin = false;
    return this.skills.save(row);
  }

  async remove(id: string) {
    await this.get(id);
    await this.skills.delete(id);
    return { ok: true };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.skills.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    return makeAdminExport(
      "skills",
      rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        category: r.category,
        purpose: r.purpose,
        systemPrompt: r.systemPrompt,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      })),
    );
  }

  async importItems(body: unknown) {
    let raw: Array<Partial<CreateSkillInput> & { slug?: string }>;
    try {
      raw = parseAdminImportItems(body, "skills");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const slug = normalizeSlug(String(item.slug ?? ""));
      const name = String(item.name ?? "").trim();
      const purpose = normalizePurpose(String(item.purpose ?? ""));
      const systemPrompt = String(item.systemPrompt ?? "").trim();
      const category = item.category as SkillCategory | undefined;
      if (!slug || !name || !purpose || !systemPrompt || !category) continue;
      const existing = await this.skills.findOne({ where: { slug } });
      const payload = {
        name,
        description: item.description?.trim() || null,
        category,
        purpose,
        systemPrompt,
        enabled: item.enabled !== false,
        sortOrder: Number(item.sortOrder) || 100,
        builtin: false,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.skills.save(existing);
        updated += 1;
      } else {
        await this.skills.save(this.skills.create({ slug, ...payload }));
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }

  /** Runtime: DB enabled skill first, then code fallback. */
  async resolveSystemPrompt(opts: {
    purpose: string;
    canvasProjectId?: string | null;
    override?: string | null;
  }): Promise<string> {
    const override = opts.override?.trim();
    if (override) return override;

    let purpose = opts.purpose || "chat";
    if (purpose === "split_shots") purpose = "script_plan";
    if (
      (purpose === "chat" || !purpose) &&
      opts.canvasProjectId
    ) {
      purpose = "canvas_text";
    }

    // 漫剧流水线内置技能：优先代码侧 FALLBACK，避免 DB 旧提示词缺字段（如 tags）
    if (purpose === "analyze_assets" && FALLBACK_BY_PURPOSE.analyze_assets) {
      return FALLBACK_BY_PURPOSE.analyze_assets;
    }

    const row = await this.skills.findOne({
      where: { purpose, enabled: true },
      order: { sortOrder: "ASC", createdAt: "ASC" },
    });
    if (row?.systemPrompt?.trim()) return row.systemPrompt.trim();

    if (opts.canvasProjectId && purpose !== "canvas_text") {
      const canvas = await this.skills.findOne({
        where: { purpose: "canvas_text", enabled: true },
      });
      if (canvas?.systemPrompt?.trim()) return canvas.systemPrompt.trim();
    }

    return (
      FALLBACK_BY_PURPOSE[purpose] ??
      (opts.canvasProjectId ? CANVAS_TEXT_SYSTEM : "你是有帮助的助手。")
    );
  }
}

function normalizeSlug(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePurpose(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}
