import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import axios from "axios";
import { formatProviderErrorBody } from "@joyai/ai-providers";
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
  /** Short TTL for default-model lookups (no modelId). */
  private defaultByKind = new Map<
    string,
    { at: number; model: Model }
  >();
  private static readonly DEFAULT_TTL_MS = 30_000;

  constructor(
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
    @InjectRepository(Model) private readonly models: Repository<Model>,
  ) {}

  async list(
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      platform?: string;
      enabled?: boolean;
    } = {},
  ) {
    const { page, pageSize, skip } = normalizePage(query.page, query.pageSize);

    const qb = this.channels
      .createQueryBuilder("channel")
      .loadRelationCountAndMap("channel.modelCount", "channel.models")
      .orderBy("channel.createdAt", "DESC")
      .skip(skip)
      .take(pageSize);

    if (query.platform) {
      qb.andWhere("channel.platform = :platform", {
        platform: query.platform,
      });
    }
    if (query.enabled !== undefined) {
      qb.andWhere("channel.enabled = :enabled", { enabled: query.enabled });
    }

    const keyword = query.keyword?.trim();
    if (keyword) {
      qb.andWhere(
        "(channel.name LIKE :kw OR channel.platform LIKE :kw OR channel.baseUrl LIKE :kw)",
        { kw: `%${keyword}%` },
      );
    }

    const [rows, total] = await qb.getManyAndCount();

    const items = rows.map((row) => {
      const { modelCount, ...channel } = row as Channel & {
        modelCount?: number;
      };
      return {
        ...channel,
        modelCount: modelCount ?? 0,
      };
    });

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
    metadata?: Record<string, unknown> | null;
  }) {
    return this.channels.save(
      this.channels.create({
        name: data.name,
        platform: data.platform,
        apiKey: data.apiKey,
        baseUrl: data.baseUrl,
        enabled: data.enabled ?? true,
        metadata: data.metadata ?? null,
      }),
    );
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      apiKey: string;
      baseUrl: string;
      enabled: boolean;
      metadata: Record<string, unknown> | null;
    }>,
  ) {
    const channel = await this.require(id);
    const { metadata, ...rest } = data;
    Object.assign(channel, rest);
    if (metadata !== undefined) {
      if (metadata === null) {
        channel.metadata = null;
      } else {
        const prev =
          channel.metadata &&
          typeof channel.metadata === "object" &&
          !Array.isArray(channel.metadata)
            ? { ...channel.metadata }
            : {};
        for (const [key, value] of Object.entries(metadata)) {
          if (value === null || value === "") {
            delete prev[key];
          } else {
            prev[key] = value;
          }
        }
        channel.metadata = prev;
      }
    }
    return this.channels.save(channel);
  }

  async require(id: string) {
    const channel = await this.channels.findOne({ where: { id } });
    if (!channel) throw new NotFoundException("渠道不存在");
    return channel;
  }

  async remove(id: string) {
    const channel = await this.require(id);
    await this.channels.delete(id);
    return channel;
  }

  async exportAll(ids?: string[]) {
    const rows = await this.channels.find({
      where: ids?.length ? { id: In(ids) } : undefined,
      order: { createdAt: "ASC" },
    });
    return makeAdminExport(
      "channels",
      rows.map((r) => ({
        name: r.name,
        platform: r.platform,
        apiKey: r.apiKey,
        baseUrl: r.baseUrl,
        enabled: r.enabled,
        metadata: r.metadata,
      })),
    );
  }

  async importItems(body: unknown) {
    let raw: Array<{
      name?: string;
      platform?: string;
      apiKey?: string;
      baseUrl?: string;
      enabled?: boolean;
      metadata?: Record<string, unknown> | null;
    }>;
    try {
      raw = parseAdminImportItems(body, "channels");
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "导入失败",
      );
    }
    let created = 0;
    let updated = 0;
    for (const item of raw) {
      const name = String(item.name ?? "").trim();
      const platform = String(item.platform ?? "").trim();
      const baseUrl = String(item.baseUrl ?? "").trim();
      if (!name || !platform || !baseUrl) continue;
      const existing = await this.channels.findOne({
        where: { name, platform },
      });
      const apiKey = String(item.apiKey ?? "").trim();
      if (existing) {
        existing.baseUrl = baseUrl;
        existing.enabled = item.enabled !== false;
        if (apiKey) existing.apiKey = apiKey;
        if (item.metadata !== undefined) existing.metadata = item.metadata;
        await this.channels.save(existing);
        updated += 1;
      } else {
        if (!apiKey) continue;
        await this.channels.save(
          this.channels.create({
            name,
            platform,
            apiKey,
            baseUrl,
            enabled: item.enabled !== false,
            metadata: item.metadata ?? null,
          }),
        );
        created += 1;
      }
    }
    return { created, updated, total: raw.length };
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
        ? channel.metadata
        : {};
    channel.metadata = { ...prev, lastProbe };
    await this.channels.save(channel);
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
      const detail = formatProviderErrorBody(data, status, {
        fallback: `HTTP ${status}`,
      });
      return {
        ok: false,
        latencyMs,
        httpStatus: status,
        message: detail,
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message =
        error instanceof Error ? error.message : "网络请求失败";
      return { ok: false, latencyMs, message };
    }
  }

  async resolveForKind(kind: "image" | "video" | "llm" | "audio", modelId?: string) {
    if (modelId) {
      const model = await this.models.findOne({
        where: { id: modelId },
        relations: ["channel"],
      });
      if (!model || !model.enabled || !model.channel.enabled) {
        throw new NotFoundException("模型不可用");
      }
      return model;
    }

    const cached = this.defaultByKind.get(kind);
    if (
      cached &&
      Date.now() - cached.at < ChannelsService.DEFAULT_TTL_MS
    ) {
      return cached.model;
    }

    // Prefer admin-marked default, then most recently updated enabled model.
    const preferred = await this.models.findOne({
      where: {
        kind: kind as JobKind,
        enabled: true,
        isDefault: true,
        channel: { enabled: true },
      },
      relations: ["channel"],
      order: { updatedAt: "DESC" },
    });
    if (preferred) {
      this.defaultByKind.set(kind, { at: Date.now(), model: preferred });
      return preferred;
    }

    const fallback = await this.models.findOne({
      where: {
        kind: kind as JobKind,
        enabled: true,
        channel: { enabled: true },
      },
      relations: ["channel"],
      order: { updatedAt: "DESC" },
    });
    if (!fallback) throw new NotFoundException(`没有可用的 ${kind} 模型`);
    this.defaultByKind.set(kind, { at: Date.now(), model: fallback });
    return fallback;
  }
}
