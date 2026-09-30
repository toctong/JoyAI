import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import {
  makeAdminExport,
  parseAdminImportItems,
} from "../../common/admin-export";
import { CATALOG_TTL_MS, TtlCache } from "../../common/ttl-cache";
import {
  PromptPreset,
  type PromptPresetScope,
} from "../../database/entities/prompt-preset.entity";
import { CanvasService } from "../canvas/canvas.service";

const TITLE_MAX = 50;
const TEXT_MAX = 5000;

export type AdminListQuery = {
  enabled?: boolean;
  q?: string;
};

export type GlobalPresetInput = {
  title?: string;
  text: string;
  enabled?: boolean;
  sortOrder?: number;
};

export type CanvasPresetInput = {
  title?: string;
  text: string;
};

function normalizeTitle(title: string, text: string) {
  const t = title.trim() || text.trim().slice(0, 24);
  return t.slice(0, TITLE_MAX) || "未命名预设";
}

function normalizeText(text: string) {
  const t = text.trim().slice(0, TEXT_MAX);
  if (!t) throw new BadRequestException("提示词不能为空");
  return t;
}

@Injectable()
export class PromptPresetsService {
  private readonly globalPublicCache = new TtlCache<PromptPreset[]>(
    CATALOG_TTL_MS,
  );

  constructor(
    @InjectRepository(PromptPreset)
    private readonly presets: Repository<PromptPreset>,
    private readonly canvas: CanvasService,
  ) {}

  private bustGlobalPublicCache() {
    this.globalPublicCache.clear();
  }

  async listGlobalPublic() {
    const hit = this.globalPublicCache.get();
    if (hit) return hit;
    const rows = await this.presets.find({
      where: { scope: "global", enabled: true, canvasProjectId: IsNull() },
      order: { sortOrder: "ASC", updatedAt: "DESC" },
    });
    this.globalPublicCache.set(rows);
    return rows;
  }

  async listAdmin(opts?: AdminListQuery) {
    const qb = this.presets
      .createQueryBuilder("p")
      .where("p.scope = :scope", { scope: "global" as PromptPresetScope })
      .orderBy("p.sortOrder", "ASC")
      .addOrderBy("p.updatedAt", "DESC");
    if (opts?.enabled !== undefined) {
      qb.andWhere("p.enabled = :enabled", { enabled: opts.enabled });
    }
    const q = opts?.q?.trim();
    if (q) {
      qb.andWhere("(p.title LIKE :q OR p.text LIKE :q)", { q: `%${q}%` });
    }
    return qb.getMany();
  }

  async getGlobal(id: string) {
    const row = await this.presets.findOne({
      where: { id, scope: "global", canvasProjectId: IsNull() },
    });
    if (!row) throw new NotFoundException("预设不存在");
    return row;
  }

  async createGlobal(input: GlobalPresetInput) {
    this.bustGlobalPublicCache();
    const text = normalizeText(input.text);
    const row = this.presets.create({
      title: normalizeTitle(input.title ?? "", text),
      text,
      scope: "global",
      canvasProjectId: null,
      enabled: input.enabled !== false,
      sortOrder: input.sortOrder ?? 100,
      createdByUserId: null,
    });
    return this.presets.save(row);
  }

  async updateGlobal(id: string, input: Partial<GlobalPresetInput>) {
    this.bustGlobalPublicCache();
    const row = await this.getGlobal(id);
    if (input.text !== undefined) {
      row.text = normalizeText(input.text);
    }
    if (input.title !== undefined || input.text !== undefined) {
      row.title = normalizeTitle(input.title ?? row.title, row.text);
    }
    if (input.enabled !== undefined) row.enabled = input.enabled;
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    return this.presets.save(row);
  }

  async removeGlobal(id: string) {
    this.bustGlobalPublicCache();
    const row = await this.getGlobal(id);
    await this.presets.remove(row);
    return { ok: true };
  }

  async exportGlobal(ids?: string[]) {
    const rows = await this.presets.find({
      where: ids?.length
        ? { id: In(ids), scope: "global", canvasProjectId: IsNull() }
        : { scope: "global", canvasProjectId: IsNull() },
      order: { sortOrder: "ASC", updatedAt: "DESC" },
    });
    return makeAdminExport(
      "prompt-presets",
      rows.map((r) => ({
        title: r.title,
        text: r.text,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
      })),
    );
  }

  async importGlobal(body: unknown) {
    this.bustGlobalPublicCache();
    let raw: Array<{
      title?: string;
      text?: string;
      enabled?: boolean;
      sortOrder?: number;
    }>;
    try {
      raw = parseAdminImportItems(body, "prompt-presets");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const textRaw = String(item.text ?? "").trim();
      if (!textRaw) continue;
      const text = normalizeText(textRaw);
      const title = normalizeTitle(String(item.title ?? ""), text);
      const existing = await this.presets.findOne({
        where: {
          scope: "global",
          canvasProjectId: IsNull(),
          title,
        },
      });
      if (existing) {
        existing.text = text;
        existing.enabled = item.enabled !== false;
        existing.sortOrder = Number(item.sortOrder) || existing.sortOrder;
        await this.presets.save(existing);
        updated += 1;
      } else {
        await this.presets.save(
          this.presets.create({
            title,
            text,
            scope: "global",
            canvasProjectId: null,
            enabled: item.enabled !== false,
            sortOrder: Number(item.sortOrder) || 100,
            createdByUserId: null,
          }),
        );
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
  }

  async listForCanvas(userId: string, projectId: string) {
    await this.canvas.get(userId, projectId);
    return this.presets.find({
      where: { scope: "canvas", canvasProjectId: projectId },
      order: { updatedAt: "DESC" },
    });
  }

  async createForCanvas(
    userId: string,
    projectId: string,
    input: CanvasPresetInput,
  ) {
    await this.canvas.get(userId, projectId);
    const text = normalizeText(input.text);
    const row = this.presets.create({
      title: normalizeTitle(input.title ?? "", text),
      text,
      scope: "canvas",
      canvasProjectId: projectId,
      enabled: true,
      sortOrder: 0,
      createdByUserId: userId,
    });
    return this.presets.save(row);
  }

  async updateForCanvas(
    userId: string,
    projectId: string,
    id: string,
    input: Partial<CanvasPresetInput>,
  ) {
    await this.canvas.get(userId, projectId);
    const row = await this.presets.findOne({
      where: { id, scope: "canvas", canvasProjectId: projectId },
    });
    if (!row) throw new NotFoundException("预设不存在");
    if (input.text !== undefined) {
      row.text = normalizeText(input.text);
    }
    if (input.title !== undefined || input.text !== undefined) {
      row.title = normalizeTitle(input.title ?? row.title, row.text);
    }
    return this.presets.save(row);
  }

  async removeForCanvas(userId: string, projectId: string, id: string) {
    await this.canvas.get(userId, projectId);
    const row = await this.presets.findOne({
      where: { id, scope: "canvas", canvasProjectId: projectId },
    });
    if (!row) throw new NotFoundException("预设不存在");
    await this.presets.remove(row);
    return { ok: true };
  }

  /** Bulk-create canvas presets (import / localStorage migrate). */
  async importForCanvas(
    userId: string,
    projectId: string,
    items: CanvasPresetInput[],
  ) {
    await this.canvas.get(userId, projectId);
    if (!Array.isArray(items) || !items.length) {
      throw new BadRequestException("没有可用预设");
    }
    const rows: PromptPreset[] = [];
    for (const item of items) {
      try {
        const text = normalizeText(item.text ?? "");
        rows.push(
          this.presets.create({
            title: normalizeTitle(item.title ?? "", text),
            text,
            scope: "canvas",
            canvasProjectId: projectId,
            enabled: true,
            sortOrder: 0,
            createdByUserId: userId,
          }),
        );
      } catch {
        /* skip invalid */
      }
    }
    if (!rows.length) throw new BadRequestException("没有可用预设");
    await this.presets.save(rows);
    return { count: rows.length };
  }
}
