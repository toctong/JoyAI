import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Skill, type SkillCategory } from "../../database/entities/skill.entity";
import {
  ANALYZE_ASSETS_SYSTEM,
  AUTHOR_PROMPTS_SYSTEM,
  CANVAS_TEXT_SYSTEM,
  PLAN_EPISODES_SYSTEM,
  PROMPT_OPTIMIZE_SYSTEM,
  REVERSE_PROMPT_SYSTEM,
  SCRIPT_PLAN_SYSTEM,
  SCRIPT_WRITE_SYSTEM,
  SERIES_MEMORY_SYSTEM,
} from "../jobs/llm-prompts";
import { loadXiaoluoBuiltinSeeds } from "./xiaoluo-catalog";

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

type BuiltinSeed = {
  slug: string;
  name: string;
  description: string;
  category: SkillCategory;
  purpose: string;
  systemPrompt: string;
  sortOrder: number;
};

const BUILTIN_SKILLS: BuiltinSeed[] = [
  {
    slug: "analyze-assets",
    name: "资产分析",
    description: "从剧本抽取角色、场景、道具与分集规划。",
    category: "manju",
    purpose: "analyze_assets",
    systemPrompt: ANALYZE_ASSETS_SYSTEM,
    sortOrder: 10,
  },
  {
    slug: "plan-episodes",
    name: "分集规划",
    description: "把原文切成可拍摄的分集，并标注原文起止引文。",
    category: "manju",
    purpose: "plan_episodes",
    systemPrompt: PLAN_EPISODES_SYSTEM,
    sortOrder: 20,
  },
  {
    slug: "series-memory",
    name: "连载记忆",
    description: "整理世界观、角色小传与未回收伏笔。",
    category: "manju",
    purpose: "series_memory",
    systemPrompt: SERIES_MEMORY_SYSTEM,
    sortOrder: 30,
  },
  {
    slug: "script-plan",
    name: "分镜脚本",
    description: "把原文拆成有序镜头，锁定画面、对白与资产。",
    category: "manju",
    purpose: "script_plan",
    systemPrompt: SCRIPT_PLAN_SYSTEM,
    sortOrder: 40,
  },
  {
    slug: "author-prompts",
    name: "提示词撰写",
    description: "按镜号补画面 / 视频提示词，不改对白与镜序。",
    category: "manju",
    purpose: "author_prompts",
    systemPrompt: AUTHOR_PROMPTS_SYSTEM,
    sortOrder: 50,
  },
  {
    slug: "script-write",
    name: "AI 帮写",
    description: "对话生成或润色剧本，不自动回写项目。",
    category: "manju",
    purpose: "script_write",
    systemPrompt: SCRIPT_WRITE_SYSTEM,
    sortOrder: 60,
  },
  {
    slug: "canvas-text",
    name: "画布文本",
    description: "画布文本节点创作助手。",
    category: "canvas",
    purpose: "canvas_text",
    systemPrompt: CANVAS_TEXT_SYSTEM,
    sortOrder: 70,
  },
  {
    slug: "reverse-prompt",
    name: "反推提示词",
    description: "根据参考图反推适合生图的提示词。",
    category: "tools",
    purpose: "reverse_prompt",
    systemPrompt: REVERSE_PROMPT_SYSTEM,
    sortOrder: 80,
  },
  {
    slug: "prompt-optimize",
    name: "提示词优化",
    description: "把用户提示词改写成更高质量的生成提示词。",
    category: "tools",
    purpose: "prompt_optimize",
    systemPrompt: PROMPT_OPTIMIZE_SYSTEM,
    sortOrder: 90,
  },
];

const FALLBACK_BY_PURPOSE: Record<string, string> = {
  analyze_assets: ANALYZE_ASSETS_SYSTEM,
  script_plan: SCRIPT_PLAN_SYSTEM,
  split_shots: SCRIPT_PLAN_SYSTEM,
  author_prompts: AUTHOR_PROMPTS_SYSTEM,
  series_memory: SERIES_MEMORY_SYSTEM,
  plan_episodes: PLAN_EPISODES_SYSTEM,
  script_write: SCRIPT_WRITE_SYSTEM,
  reverse_prompt: REVERSE_PROMPT_SYSTEM,
  prompt_optimize: PROMPT_OPTIMIZE_SYSTEM,
  canvas_text: CANVAS_TEXT_SYSTEM,
};

@Injectable()
export class SkillsService implements OnModuleInit {
  private readonly logger = new Logger(SkillsService.name);

  constructor(
    @InjectRepository(Skill) private readonly skills: Repository<Skill>,
  ) {}

  async onModuleInit() {
    await this.ensureBuiltinSkills();
  }

  async ensureBuiltinSkills() {
    const seeds: BuiltinSeed[] = [
      ...BUILTIN_SKILLS,
      ...loadXiaoluoBuiltinSeeds(),
    ];

    for (const seed of seeds) {
      const existing = await this.skills.findOne({
        where: { slug: seed.slug },
      });
      if (existing) {
        let dirty = false;
        if (!existing.builtin) {
          existing.builtin = true;
          dirty = true;
        }
        // Builtin always stays enabled.
        if (!existing.enabled) {
          existing.enabled = true;
          dirty = true;
        }
        if (!existing.systemPrompt?.trim()) {
          existing.systemPrompt = seed.systemPrompt;
          dirty = true;
        }
        // First-time backfill of Xiaoluo prompts for empty/short stubs only.
        if (
          existing.builtin &&
          existing.systemPrompt.length < 80 &&
          seed.systemPrompt.length > existing.systemPrompt.length
        ) {
          existing.systemPrompt = seed.systemPrompt;
          dirty = true;
        }
        if (!existing.description && seed.description) {
          existing.description = seed.description;
          dirty = true;
        }
        if (dirty) await this.skills.save(existing);
        continue;
      }
      await this.skills.save(
        this.skills.create({
          ...seed,
          builtin: true,
          enabled: true,
        }),
      );
    }
    this.logger.log(`Builtin skills ensured (${seeds.length})`);
  }

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

    if (input.enabled !== undefined) {
      if (row.builtin && input.enabled === false) {
        throw new BadRequestException("内置技能不可停用");
      }
      row.enabled = input.enabled;
    }

    if (input.purpose !== undefined) {
      if (row.builtin) {
        throw new BadRequestException("内置技能不可修改 purpose");
      }
      const purpose = normalizePurpose(input.purpose);
      if (!purpose) throw new BadRequestException("purpose 无效");
      row.purpose = purpose;
    }

    return this.skills.save(row);
  }

  async remove(id: string) {
    const row = await this.get(id);
    if (row.builtin) {
      throw new BadRequestException("内置技能不可删除，可改为停用");
    }
    await this.skills.delete(id);
    return { ok: true };
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
