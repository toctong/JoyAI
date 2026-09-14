import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import axios from "axios";
import {
  normalizePage,
  type PaginatedResult,
} from "../../common/dto/pagination-query.dto";
import { PrismaService } from "../../common/prisma/prisma.service";

export type ChannelTestResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  httpStatus?: number;
  modelCount?: number;
  testedAt?: string;
};

export type ChannelLastProbe = {
  ok: boolean;
  latencyMs: number;
  message: string;
  testedAt: string;
  httpStatus?: number;
  modelCount?: number;
};

@Injectable()
export class ChannelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    platform?: string;
    enabled?: boolean;
  } = {}) {
    const { page, pageSize, skip } = normalizePage(query.page, query.pageSize);
    const where: Prisma.ChannelWhereInput = {};

    if (query.platform) where.platform = query.platform;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { platform: { contains: keyword } },
        { baseUrl: { contains: keyword } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.channel.findMany({
        where,
        include: { _count: { select: { models: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.channel.count({ where }),
    ]);

    const items = rows.map(({ _count, ...channel }) => ({
      ...channel,
      modelCount: _count.models,
    }));

    return { items, total, page, pageSize } satisfies PaginatedResult<
      (typeof items)[number]
    >;
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

  /**
   * Probe OpenAI-compatible GET /models (Ark / APIMart / ToAPIs / DashScope).
   * Persists the latest result on the channel so the admin list can show it.
   */
  async testConnection(
    id: string,
    overrides?: { apiKey?: string; baseUrl?: string },
  ): Promise<ChannelTestResult> {
    const channel = await this.require(id);
    const result = await this.probe({
      apiKey: overrides?.apiKey?.trim() || channel.apiKey,
      baseUrl: overrides?.baseUrl?.trim() || channel.baseUrl,
    });
    const testedAt = new Date().toISOString();
    const lastProbe: ChannelLastProbe = {
      ok: result.ok,
      latencyMs: result.latencyMs,
      message: result.message,
      testedAt,
      httpStatus: result.httpStatus,
      modelCount: result.modelCount,
    };
    const prev =
      channel.metadata &&
      typeof channel.metadata === "object" &&
      !Array.isArray(channel.metadata)
        ? (channel.metadata as Record<string, unknown>)
        : {};
    await this.prisma.channel.update({
      where: { id },
      data: {
        metadata: { ...prev, lastProbe } as Prisma.InputJsonValue,
      },
    });
    return { ...result, testedAt };
  }

  async probe(params: {
    apiKey: string;
    baseUrl: string;
  }): Promise<ChannelTestResult> {
    const base = params.baseUrl.replace(/\/$/, "");
    const started = Date.now();
    try {
      const { data, status } = await axios.get(`${base}/models`, {
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
        validateStatus: () => true,
      });
      const latencyMs = Date.now() - started;

      if (status >= 200 && status < 300) {
        const list = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
        return {
          ok: true,
          latencyMs,
          httpStatus: status,
          modelCount: list.length || undefined,
          message:
            list.length > 0
              ? `连通正常 · 上游返回 ${list.length} 个模型`
              : "连通正常",
        };
      }
      if (status === 401 || status === 403) {
        return {
          ok: false,
          latencyMs,
          httpStatus: status,
          message: "鉴权失败，请检查 API Key",
        };
      }
      if (status === 404) {
        return {
          ok: false,
          latencyMs,
          httpStatus: status,
          message: "未找到 /models，请确认 Base URL 是否以 /v1 结尾",
        };
      }
      const detail =
        data?.error?.message ?? data?.message ?? data?.code ?? `HTTP ${status}`;
      return {
        ok: false,
        latencyMs,
        httpStatus: status,
        message: String(detail),
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message =
        error instanceof Error ? error.message : "网络请求失败";
      return { ok: false, latencyMs, message };
    }
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
      where: {
        kind,
        enabled: true,
        isDefault: true,
        channel: { enabled: true },
      },
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
