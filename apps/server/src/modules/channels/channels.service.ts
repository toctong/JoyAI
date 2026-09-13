import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.channel.findMany({
      include: { models: true },
      orderBy: { createdAt: "desc" },
    });
  }

  create(data: {
    name: string;
    platform: string;
    apiKey: string;
    baseUrl: string;
    enabled?: boolean;
    metadata?: Prisma.InputJsonValue;
  }) {
    return this.prisma.channel.create({ data });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      metadata: Prisma.InputJsonValue;
    }>,
  ) {
    await this.require(id);
    return this.prisma.channel.update({ where: { id }, data });
  }

  async require(id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException("渠道不存在");
    return channel;
  }

  async remove(id: string) {
    await this.require(id);
    return this.prisma.channel.delete({ where: { id } });
  }

  async resolveForKind(kind: "image" | "video", modelId?: string) {
    if (modelId) {
      const model = await this.prisma.model.findUnique({
        where: { id: modelId },
        include: { channel: true },
      });
      if (!model || !model.enabled || !model.channel.enabled) {
        throw new NotFoundException("模型不可用");
      }
      return model;
    }

    const model = await this.prisma.model.findFirst({
      where: { kind, enabled: true, isDefault: true, channel: { enabled: true } },
      include: { channel: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!model) {
      const fallback = await this.prisma.model.findFirst({
        where: { kind, enabled: true, channel: { enabled: true } },
        include: { channel: true },
      });
      if (!fallback) throw new NotFoundException(`没有可用的 ${kind} 模型`);
      return fallback;
    }
    return model;
  }
}
