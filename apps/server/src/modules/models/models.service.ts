import { Injectable, NotFoundException } from "@nestjs/common";
import { JobKind, Prisma } from "@prisma/client";
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
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    kind?: JobKind;
    enabled?: boolean;
    isDefault?: boolean;
    channelId?: string;
  } = {}) {
    const { page, pageSize, skip } = normalizePage(query.page, query.pageSize);
    const where: Prisma.ModelWhereInput = {};

    if (query.kind) where.kind = query.kind;
    if (query.enabled !== undefined) where.enabled = query.enabled;
    if (query.isDefault !== undefined) where.isDefault = query.isDefault;
    if (query.channelId) where.channelId = query.channelId;

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { remoteId: { contains: keyword } },
        { description: { contains: keyword } },
        { channel: { name: { contains: keyword } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.model.findMany({
        where,
        include: {
          channel: { select: { id: true, name: true, platform: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.model.count({ where }),
    ]);

    return { items, total, page, pageSize } satisfies PaginatedResult<(typeof items)[number]>;
  }

  listPublic() {
    return this.prisma.model.findMany({
      where: {
        enabled: true,
        channel: { enabled: true },
        kind: { in: ["image", "video"] },
      },
      select: {
        id: true,
        name: true,
        kind: true,
        isDefault: true,
        description: true,
        pricing: true,
        capabilities: true,
        remoteId: true,
        channel: { select: { platform: true, name: true } },
      },
      orderBy: [{ kind: "asc" }, { isDefault: "desc" }],
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
    return this.prisma.model.create({
      data: {
        channelId: data.channelId,
        name: data.name,
        kind: data.kind,
        remoteId: data.remoteId,
        description: data.description,
        pricing: (data.pricing ?? undefined) as Prisma.InputJsonValue | undefined,
        capabilities: (data.capabilities ??
          undefined) as Prisma.InputJsonValue | undefined,
        enabled: data.enabled,
        isDefault: data.isDefault,
      },
    });
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
    const model = await this.prisma.model.findUnique({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");

    const patch: Prisma.ModelUpdateInput = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.remoteId !== undefined) patch.remoteId = data.remoteId;
    if (data.description !== undefined) patch.description = data.description;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.isDefault !== undefined) patch.isDefault = data.isDefault;
    if (data.pricing !== undefined) {
      patch.pricing =
        data.pricing === null
          ? Prisma.DbNull
          : (data.pricing as Prisma.InputJsonValue);
    }
    if (data.capabilities !== undefined) {
      patch.capabilities =
        data.capabilities === null
          ? Prisma.DbNull
          : (data.capabilities as Prisma.InputJsonValue);
    }

    return this.prisma.model.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    const model = await this.prisma.model.findUnique({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");
    return this.prisma.model.delete({ where: { id } });
  }

  /**
   * Upsert catalog presets for a channel. Updates pricing/capabilities/description;
   * keeps existing name/isDefault unless forceRename.
   */
  async importCatalog(
    channelId: string,
    opts?: { forceRename?: boolean },
  ): Promise<{ created: number; updated: number; skipped: number }> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException("渠道不存在");

    const catalog = getCatalogForPlatform(channel.platform);
    if (!catalog.length) {
      return { created: 0, updated: 0, skipped: 0 };
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const item of catalog) {
      const existing = await this.prisma.model.findUnique({
        where: {
          channelId_remoteId: {
            channelId,
            remoteId: item.remoteId,
          },
        },
      });

      if (existing) {
        await this.prisma.model.update({
          where: { id: existing.id },
          data: {
            ...(opts?.forceRename ? { name: item.name } : {}),
            description: item.description ?? existing.description,
            pricing: item.pricing as Prisma.InputJsonValue,
            capabilities: item.capabilities as Prisma.InputJsonValue,
            kind: item.kind,
          },
        });
        updated += 1;
      } else {
        await this.prisma.model.create({
          data: {
            channelId,
            name: item.name,
            kind: item.kind,
            remoteId: item.remoteId,
            description: item.description,
            pricing: item.pricing as Prisma.InputJsonValue,
            capabilities: item.capabilities as Prisma.InputJsonValue,
            enabled: true,
            isDefault: item.isDefault ?? false,
          },
        });
        created += 1;
      }
    }

    return { created, updated, skipped };
  }

  catalogPreview(platform: string) {
    const preset =
      CHANNEL_PRESETS[platform as ProviderPlatformId] ?? null;
    return {
      platform,
      preset,
      models: getCatalogForPlatform(platform),
    };
  }
}
