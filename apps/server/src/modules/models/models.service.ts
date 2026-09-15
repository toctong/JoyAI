import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import {
  CHANNEL_PRESETS,
  getCatalogForPlatform,
  type ModelCapabilities,
  type ModelPricing,
  type ProviderPlatformId,
} from "@joyai/shared";
import {
  normalizePage,
  type PaginatedResult,
} from "../../common/dto/pagination-query.dto";
import { Channel } from "../../database/entities/channel.entity";
import { Model } from "../../database/entities/model.entity";
import { JobKind } from "../../database/enums";

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

    const items = rows.map((m) => ({
      ...m,
      channel: m.channel
        ? {
            id: m.channel.id,
            name: m.channel.name,
            platform: m.channel.platform,
          }
        : null,
    }));

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
        kind: In([JobKind.image, JobKind.video]),
        channel: { enabled: true },
      },
      relations: ["channel"],
      order: { kind: "ASC", isDefault: "DESC" },
    });

    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      kind: m.kind,
      isDefault: m.isDefault,
      description: m.description,
      pricing: m.pricing,
      capabilities: m.capabilities,
      remoteId: m.remoteId,
      channel: {
        platform: m.channel.platform,
        name: m.channel.name,
      },
    }));
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

  /**
   * Upsert catalog presets for a channel. Updates pricing/capabilities/description;
   * keeps existing name/isDefault unless forceRename.
   */
  async importCatalog(
    channelId: string,
    opts?: { forceRename?: boolean },
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const channel = await this.channels.findOne({ where: { id: channelId } });
    if (!channel) throw new NotFoundException("渠道不存在");

    const catalog = getCatalogForPlatform(channel.platform);
    if (!catalog.length) {
      return { created: 0, updated: 0, skipped: 0 };
    }

    let created = 0;
    let updated = 0;
    const skipped = 0;

    for (const item of catalog) {
      const existing = await this.models.findOne({
        where: { channelId, remoteId: item.remoteId },
      });

      if (existing) {
        if (opts?.forceRename) existing.name = item.name;
        existing.description = item.description ?? existing.description;
        existing.pricing = (item.pricing as Record<string, unknown>) ?? null;
        existing.capabilities =
          (item.capabilities as Record<string, unknown>) ?? null;
        existing.kind = item.kind as JobKind;
        await this.models.save(existing);
        updated += 1;
      } else {
        await this.models.save(
          this.models.create({
            channelId,
            name: item.name,
            kind: item.kind as JobKind,
            remoteId: item.remoteId,
            description: item.description ?? null,
            pricing: (item.pricing as Record<string, unknown>) ?? null,
            capabilities:
              (item.capabilities as Record<string, unknown>) ?? null,
            enabled: true,
            isDefault: item.isDefault ?? false,
          }),
        );
        created += 1;
      }
    }

    return { created, updated, skipped };
  }

  catalogPreview(platform: string) {
    const preset = CHANNEL_PRESETS[platform as ProviderPlatformId] ?? null;
    return {
      platform,
      preset,
      models: getCatalogForPlatform(platform),
    };
  }
}
