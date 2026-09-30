import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  CHANNEL_PRESETS,
  getCatalogForPlatform,
  resolveAdapterId,
  type ModelCapabilities,
  type ModelPricing,
  type ProviderPlatformId,
} from "@joyai/shared";
import {
  normalizePage,
  type PaginatedResult,
} from "../../common/dto/pagination-query.dto";
import {
  makeAdminExport,
  parseAdminImportItems,
} from "../../common/admin-export";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { JobKind } from "../../database/enums";

/** Legacy remoteIds → current catalog ids (matched during import). */
const CATALOG_REMOTE_ID_ALIASES: Record<string, string[]> = {
  gemini_omni_flash: ["gemini-omni-flash"],
  "gemini-omni-flash-preview-official": ["gemini_omni"],
  "sora-2-official": ["sora-2"],
};

@Injectable()
export class ModelsService {
  constructor(
    @InjectRepository(Model) private readonly models: Repository<Model>,
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
  ) {}

  async list(
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      kind?: JobKind;
      enabled?: boolean;
      isDefault?: boolean;
      channelId?: string;
    } = {},
  ) {
    const { page, pageSize, skip } = normalizePage(query.page, query.pageSize);

    const qb = this.models
      .createQueryBuilder("model")
      .leftJoinAndSelect("model.channel", "channel")
      .orderBy("model.createdAt", "DESC")
      .skip(skip)
      .take(pageSize);

    if (query.kind) {
      qb.andWhere("model.kind = :kind", { kind: query.kind });
    }
    if (query.enabled !== undefined) {
      qb.andWhere("model.enabled = :enabled", { enabled: query.enabled });
    }
    if (query.isDefault !== undefined) {
      qb.andWhere("model.isDefault = :isDefault", {
        isDefault: query.isDefault,
      });
    }
    if (query.channelId) {
      qb.andWhere("model.channelId = :channelId", {
        channelId: query.channelId,
      });
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      qb.andWhere(
        "(model.name LIKE :kw OR model.remoteId LIKE :kw OR model.description LIKE :kw OR channel.name LIKE :kw)",
        { kw: `%${keyword}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    const items = rows.map((m) => {
      const caps = (m.capabilities ?? null) as ModelCapabilities | null;
      let adapterId: string | null = null;
      try {
        if (m.kind === "image" || m.kind === "video") {
          adapterId = resolveAdapterId({
            platform: m.channel?.platform ?? "",
            kind: m.kind,
            capabilities: caps,
          });
        }
      } catch {
        adapterId = null;
      }
      return {
        ...m,
        adapterId,
        channel: m.channel
          ? {
              id: m.channel.id,
              name: m.channel.name,
              platform: m.channel.platform,
            }
          : null,
      };
    });

    return {
      items,
      total,
      page,
      pageSize,
    } satisfies PaginatedResult<(typeof items)[number]>;
  }

  async listPublic() {
    const rows = await this.models.find({
      where: {
        enabled: true,
        kind: In([JobKind.image, JobKind.video, JobKind.llm, JobKind.audio]),
        channel: { enabled: true },
      },
      relations: ["channel"],
      order: { kind: "ASC", name: "ASC" },
    });

    return rows.map((m) => {
      const caps = (m.capabilities ?? null) as ModelCapabilities | null;
      let adapterId: string | null = null;
      try {
        if (
          m.kind === "image" ||
          m.kind === "video" ||
          m.kind === "llm" ||
          m.kind === "audio"
        ) {
          adapterId = resolveAdapterId({
            platform: m.channel.platform,
            kind: m.kind,
            capabilities: caps,
          });
        }
      } catch {
        adapterId = null;
      }
      return {
        id: m.id,
        name: m.name,
        kind: m.kind,
        description: m.description,
        pricing: m.pricing,
        capabilities: caps,
        adapterId,
        remoteId: m.remoteId,
        channel: {
          id: m.channel.id,
          platform: m.channel.platform,
          name: m.channel.name,
        },
      };
    });
  }

  create(data: {
    channelId: string;
    name: string;
    kind: JobKind;
    remoteId: string;
    description?: string;
    pricing?: ModelPricing | null;
    capabilities?: ModelCapabilities | null;
    enabled?: boolean;
    isDefault?: boolean;
  }) {
    return this.models.save(
      this.models.create({
        channelId: data.channelId,
        name: data.name,
        kind: data.kind,
        remoteId: data.remoteId,
        description: data.description ?? null,
        pricing: (data.pricing as Record<string, unknown> | null) ?? null,
        capabilities:
          (data.capabilities as Record<string, unknown> | null) ?? null,
        enabled: data.enabled ?? true,
        isDefault: data.isDefault ?? false,
      }),
    );
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      remoteId: string;
      description: string | null;
      pricing: ModelPricing | null;
      capabilities: ModelCapabilities | null;
      enabled: boolean;
      isDefault: boolean;
    }>,
  ) {
    const model = await this.models.findOne({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");

    if (data.name !== undefined) model.name = data.name;
    if (data.remoteId !== undefined) model.remoteId = data.remoteId;
    if (data.description !== undefined) model.description = data.description;
    if (data.enabled !== undefined) model.enabled = data.enabled;
    if (data.isDefault !== undefined) model.isDefault = data.isDefault;
    if (data.pricing !== undefined) {
      model.pricing = (data.pricing as Record<string, unknown> | null) ?? null;
    }
    if (data.capabilities !== undefined) {
      model.capabilities =
        (data.capabilities as Record<string, unknown> | null) ?? null;
    }

    return this.models.save(model);
  }

  async remove(id: string) {
    const model = await this.models.findOne({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");
    await this.models.delete(id);
    return model;
  }

  async removeMany(ids: string[]) {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) return { deleted: 0 };

    const result = await this.models.delete({ id: In(unique) });
    return { deleted: result.affected ?? 0 };
  }

  /**
   * Upsert catalog presets for a channel. Updates pricing/capabilities/description;
   * keeps existing name/isDefault unless forceRename.
   * Models whose remoteId is no longer in the catalog are disabled (not deleted),
   * so stale entries like removed presets disappear from studio without wiping custom rows
   * that still match a catalog id.
   */
  async importCatalog(
    channelId: string,
    opts?: { forceRename?: boolean },
  ): Promise<{
    created: number;
    updated: number;
    disabled: number;
    skipped: number;
  }> {
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("渠道不存在");

    const catalog = getCatalogForPlatform(channel.platform);
    if (!catalog.length) {
      return { created: 0, updated: 0, disabled: 0, skipped: 0 };
    }

    let created = 0;
    let updated = 0;
    const skipped = 0;
    const catalogIds = new Set(catalog.map((item) => item.remoteId));

    for (const item of catalog) {
      const result = await this.upsertCatalogItem(channelId, item, opts);
      if (result === "created") created += 1;
      else updated += 1;
    }

    const stale = await this.models.find({ where: { channelId } });
    let disabled = 0;
    for (const model of stale) {
      if (catalogIds.has(model.remoteId) || !model.enabled) continue;
      model.enabled = false;
      if (model.isDefault) model.isDefault = false;
      await this.models.save(model);
      disabled += 1;
    }

    return { created, updated, disabled, skipped };
  }

  /**
   * Upsert only the selected catalog remoteIds. Does not disable other models.
   */
  async importCatalogSelect(
    channelId: string,
    remoteIds: string[],
    opts?: { forceRename?: boolean },
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
  }> {
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("渠道不存在");

    const catalog = getCatalogForPlatform(channel.platform);
    if (!catalog.length) {
      return { created: 0, updated: 0, skipped: 0 };
    }

    const wanted = new Set(
      remoteIds.map((id) => id.trim()).filter(Boolean),
    );
    if (!wanted.size) {
      return { created: 0, updated: 0, skipped: 0 };
    }

    const byId = new Map(catalog.map((item) => [item.remoteId, item]));
    // Also allow selecting via legacy alias that still points at a catalog entry.
    for (const item of catalog) {
      for (const alias of CATALOG_REMOTE_ID_ALIASES[item.remoteId] ?? []) {
        if (!byId.has(alias)) byId.set(alias, item);
      }
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Set<string>();

    for (const id of wanted) {
      const item = byId.get(id);
      if (!item) {
        skipped += 1;
        continue;
      }
      if (seen.has(item.remoteId)) continue;
      seen.add(item.remoteId);
      const result = await this.upsertCatalogItem(channelId, item, opts);
      if (result === "created") created += 1;
      else updated += 1;
    }

    return { created, updated, skipped };
  }

  private async upsertCatalogItem(
    channelId: string,
    item: {
      name: string;
      remoteId: string;
      kind: string;
      description?: string;
      pricing?: unknown;
      capabilities?: unknown;
      isDefault?: boolean;
    },
    opts?: { forceRename?: boolean },
  ): Promise<"created" | "updated"> {
    const aliasIds = CATALOG_REMOTE_ID_ALIASES[item.remoteId] ?? [];
    const existing =
      (await this.models.findOne({
        where: { channelId, remoteId: item.remoteId },
      })) ??
      (aliasIds.length
        ? await this.models.findOne({
            where: { channelId, remoteId: In(aliasIds) },
          })
        : null);

    if (existing) {
      if (opts?.forceRename) existing.name = item.name;
      existing.remoteId = item.remoteId;
      existing.description = item.description ?? existing.description;
      existing.pricing =
        item.pricing != null
          ? (item.pricing as Record<string, unknown>)
          : null;
      existing.capabilities =
        (item.capabilities as Record<string, unknown>) ?? null;
      existing.kind = item.kind as JobKind;
      existing.enabled = true;
      await this.models.save(existing);
      return "updated";
    }

    await this.models.save(
      this.models.create({
        channelId,
        name: item.name,
        kind: item.kind as JobKind,
        remoteId: item.remoteId,
        description: item.description ?? null,
        pricing:
          item.pricing != null
            ? (item.pricing as Record<string, unknown>)
            : null,
        capabilities:
          (item.capabilities as Record<string, unknown>) ?? null,
        enabled: true,
        isDefault: item.isDefault ?? false,
      }),
    );
    return "created";
  }

  catalogPreview(platform: string, kind?: string) {
    const preset = CHANNEL_PRESETS[platform as ProviderPlatformId] ?? null;
    let models = getCatalogForPlatform(platform);
    const kindFilter = kind?.trim();
    if (kindFilter) {
      models = models.filter((item) => item.kind === kindFilter);
    }
    // `items` matches admin UI / list API shape; keep `models` as alias.
    return {
      platform,
      preset,
      items: models,
      models,
    };
  }

  /**
   * All remoteIds already on a channel (no pagination).
   * Also includes current catalog ids for any legacy alias rows,
   * so the admin checkbox UI can mark「已添加」correctly.
   */
  async listChannelRemoteIds(channelId: string) {
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("渠道不存在");

    const rows = await this.models.find({
      where: { channelId },
      select: ["remoteId"],
    });

    const legacyToCurrent = new Map<string, string>();
    for (const [current, aliases] of Object.entries(CATALOG_REMOTE_ID_ALIASES)) {
      for (const alias of aliases) legacyToCurrent.set(alias, current);
    }

    const remoteIds = new Set<string>();
    for (const row of rows) {
      const id = String(row.remoteId || "").trim();
      if (!id) continue;
      remoteIds.add(id);
      const current = legacyToCurrent.get(id);
      if (current) remoteIds.add(current);
    }

    return { remoteIds: [...remoteIds] };
  }

  async exportAll(ids?: string[]) {
    const rows = await this.models.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      relations: ["channel"],
      order: { createdAt: "ASC" },
    });
    return makeAdminExport(
      "models",
      rows.map((m) => ({
        channelName: m.channel?.name ?? "",
        channelPlatform: m.channel?.platform ?? "",
        name: m.name,
        kind: m.kind,
        remoteId: m.remoteId,
        description: m.description,
        pricing: m.pricing,
        capabilities: m.capabilities,
        enabled: m.enabled,
        isDefault: m.isDefault,
      })),
    );
  }

  async importItems(body: unknown) {
    let raw: Array<{
      channelName?: string;
      channelPlatform?: string;
      name?: string;
      kind?: string;
      remoteId?: string;
      description?: string | null;
      pricing?: Record<string, unknown> | null;
      capabilities?: Record<string, unknown> | null;
      enabled?: boolean;
      isDefault?: boolean;
    }>;
    try {
      raw = parseAdminImportItems(body, "models");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    const channels = await this.channels.find();
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const item of raw) {
      const channelName = String(item.channelName ?? "").trim();
      const channelPlatform = String(item.channelPlatform ?? "").trim();
      const name = String(item.name ?? "").trim();
      const remoteId = String(item.remoteId ?? "").trim();
      const kind = String(item.kind ?? "").trim() as JobKind;
      if (!name || !remoteId || !kind) {
        skipped += 1;
        continue;
      }
      let channel =
        channels.find(
          (c) =>
            c.name === channelName &&
            (!channelPlatform || c.platform === channelPlatform),
        ) ??
        channels.find((c) => c.name === channelName) ??
        (channelPlatform
          ? channels.find((c) => c.platform === channelPlatform)
          : undefined);
      if (!channel) {
        skipped += 1;
        continue;
      }
      const existing = await this.models.findOne({
        where: { channelId: channel.id, remoteId },
      });
      const payload = {
        name,
        kind,
        description: item.description?.trim() || null,
        pricing: (item.pricing as Record<string, unknown> | null) ?? null,
        capabilities:
          (item.capabilities as Record<string, unknown> | null) ?? null,
        enabled: item.enabled !== false,
        isDefault: item.isDefault === true,
      };
      if (existing) {
        Object.assign(existing, payload);
        await this.models.save(existing);
        updated += 1;
      } else {
        await this.models.save(
          this.models.create({
            channelId: channel.id,
            remoteId,
            ...payload,
          }),
        );
        created += 1;
      }
    }
    return { created, updated, skipped, total: raw.length };
  }
}
