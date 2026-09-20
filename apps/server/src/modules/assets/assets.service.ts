import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, MoreThanOrEqual, type FindOptionsWhere, Repository } from "typeorm";
import { Asset } from "../../database/entities/asset.entity";
import { StorageService } from "../storage/storage.service";
import { fetchPublicImage } from "../storage/fetch-public-image";
import { sanitizeOriginalName } from "../storage/original-name";
import { sourceFromAsset } from "./asset-source";

export type AssetListQuery = {
  take?: number;
  kind?: string;
  source?: string;
  /** ISO date or relative: 1d | 7d | 30d */
  from?: string;
  sort?: "newest" | "oldest";
};

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
    private readonly storage: StorageService,
  ) {}

  findByMd5(userId: string, md5: string) {
    return this.assets.findOne({
      where: { userId, md5: md5.trim().toLowerCase() },
      order: { createdAt: "DESC" },
    });
  }

  findByUrl(userId: string, url: string) {
    return this.assets.findOne({
      where: { userId, url: url.trim() },
      order: { createdAt: "DESC" },
    });
  }

  async getOwned(userId: string, id: string) {
    const asset = await this.assets.findOne({
      where: { id, userId },
      relations: ["job"],
    });
    if (!asset) throw new NotFoundException("素材不存在");
    return this.toListItem(asset);
  }

  /**
   * Register canvas media into the user library.
   * Reuses existing assetId / URL when possible; mirrors remote images into TOS.
   */
  async saveFromCanvas(
    userId: string,
    data: {
      assetId?: string;
      url?: string;
      kind?: string;
      text?: string;
      width?: number;
      height?: number;
      meta?: Record<string, unknown> | null;
    },
  ) {
    const originalName = sanitizeOriginalName(
      typeof data.meta?.originalName === "string"
        ? data.meta.originalName
        : undefined,
    );
    const restMeta = { ...(data.meta ?? {}) };
    delete restMeta.originalName;
    const stamp = {
      savedFromCanvas: true,
      savedAt: new Date().toISOString(),
      source: "canvas",
      ...restMeta,
      ...(originalName ? { originalName } : {}),
    };

    if (data.assetId?.trim()) {
      const owned = await this.assets.findOne({
        where: { id: data.assetId.trim(), userId },
      });
      if (!owned) throw new NotFoundException("素材不存在");
      if (!owned.source) owned.source = "canvas";
      const saved = await this.patchMeta(owned.id, stamp);
      if (saved && !saved.source) {
        saved.source = "canvas";
        await this.assets.save(saved);
      }
      return { ...(saved ?? owned), reused: true as const };
    }

    const text = data.text?.trim();
    if (text) {
      if (!this.storage.isConfigured()) {
        throw new BadRequestException("存储未配置，无法保存文本素材");
      }
      const buffer = Buffer.from(text, "utf8");
      const put = await this.storage.putObject(buffer, {
        contentType: "text/plain; charset=utf-8",
        ext: "txt",
      });
      const asset = await this.create({
        userId,
        kind: "text",
        url: put.url,
        md5: put.md5,
        mimeType: "text/plain",
        size: put.size,
        source: "canvas",
        meta: {
          ...stamp,
          sha256: put.sha256,
          storageKey: put.key,
          preview: text.slice(0, 240),
        },
      });
      return { ...asset, reused: false as const };
    }

    const url = data.url?.trim();
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
      throw new BadRequestException("没有可保存的媒体地址");
    }

    const existing = await this.findByUrl(userId, url);
    if (existing) {
      if (!existing.source) existing.source = "canvas";
      const saved = await this.patchMeta(existing.id, stamp);
      if (saved && !saved.source) {
        saved.source = "canvas";
        await this.assets.save(saved);
      }
      return { ...(saved ?? existing), reused: true as const };
    }

    const kind = (data.kind?.trim() || "image").toLowerCase();
    if (kind === "image" && this.storage.isConfigured()) {
      try {
        const image = await fetchPublicImage(url);
        const ext =
          image.contentType === "image/jpeg"
            ? "jpg"
            : image.contentType === "image/webp"
              ? "webp"
              : image.contentType === "image/gif"
                ? "gif"
                : "png";
        const put = await this.storage.putObject(image.buffer, {
          contentType: image.contentType,
          ext,
        });
        const byMd5 = await this.findByMd5(userId, put.md5);
        if (byMd5) {
          if (!byMd5.source) byMd5.source = "canvas";
          const saved = await this.patchMeta(byMd5.id, stamp);
          if (saved && !saved.source) {
            saved.source = "canvas";
            await this.assets.save(saved);
          }
          return { ...(saved ?? byMd5), reused: true as const };
        }
        const asset = await this.create({
          userId,
          kind: "image",
          url: put.url,
          md5: put.md5,
          mimeType: image.contentType,
          size: put.size,
          width: data.width,
          height: data.height,
          source: "canvas",
          meta: {
            ...stamp,
            sha256: put.sha256,
            storageKey: put.key,
            sourceUrl: url,
          },
        });
        return { ...asset, reused: false as const };
      } catch {
        // Fall through: register remote URL without mirror.
      }
    }

    const asset = await this.create({
      userId,
      kind,
      url,
      width: data.width,
      height: data.height,
      source: "canvas",
      meta: { ...stamp, remote: true },
    });
    return { ...asset, reused: false as const };
  }

  create(data: {
    userId: string;
    jobId?: string;
    kind: string;
    url: string;
    md5?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
    source?: string | null;
    meta?: Record<string, unknown> | null;
  }) {
    const source =
      data.source ??
      (typeof data.meta?.source === "string" ? data.meta.source : null);
    return this.assets.save(
      this.assets.create({
        userId: data.userId,
        jobId: data.jobId ?? null,
        kind: data.kind,
        url: data.url,
        md5: data.md5?.trim().toLowerCase() ?? null,
        mimeType: data.mimeType ?? null,
        size: data.size ?? null,
        width: data.width ?? null,
        height: data.height ?? null,
        source: source ?? null,
        meta: data.meta ?? null,
      }),
    );
  }

  findById(id: string) {
    return this.assets.findOne({ where: { id } });
  }

  async updateMirrored(
    id: string,
    data: {
      url: string;
      md5?: string;
      size?: number;
      meta?: Record<string, unknown> | null;
    },
  ) {
    const asset = await this.findById(id);
    if (!asset) return null;
    asset.url = data.url;
    if (data.md5 !== undefined) asset.md5 = data.md5.trim().toLowerCase();
    if (data.size !== undefined) asset.size = data.size;
    if (data.meta !== undefined) asset.meta = data.meta;
    return this.assets.save(asset);
  }

  async patchMeta(id: string, patch: Record<string, unknown>) {
    const asset = await this.findById(id);
    if (!asset) return null;
    asset.meta = { ...(asset.meta ?? {}), ...patch };
    return this.assets.save(asset);
  }

  async ensureSource(id: string, source: string) {
    const asset = await this.findById(id);
    if (!asset) return null;
    if (asset.source) return asset;
    asset.source = source;
    asset.meta = { ...(asset.meta ?? {}), source };
    return this.assets.save(asset);
  }

  async list(userId: string, query: AssetListQuery = {}) {
    const take = Math.min(Math.max(Number(query.take) || 50, 1), 300);
    const sort = query.sort === "oldest" ? "ASC" : "DESC";
    const kind = query.kind?.trim().toLowerCase();
    const sourceFilter = query.source?.trim().toLowerCase();
    const fromDate = parseFromFilter(query.from);

    const where: FindOptionsWhere<Asset> = { userId };
    if (
      kind === "image" ||
      kind === "video" ||
      kind === "audio" ||
      kind === "text"
    ) {
      where.kind = kind;
    }
    if (fromDate) {
      where.createdAt = MoreThanOrEqual(fromDate);
    }

    const rows = await this.assets.find({
      where,
      order: { createdAt: sort },
      take: sourceFilter ? Math.min(take * 4, 800) : take,
      relations: ["job"],
    });

    const items = rows.map((a) => this.toListItem(a));
    const filtered = sourceFilter
      ? items.filter((a) => a.source === sourceFilter)
      : items;
    return filtered.slice(0, take);
  }

  private toListItem(asset: Asset) {
    const job = asset.job ? this.toJobPreview(asset.job) : null;
    const source = sourceFromAsset({
      source: asset.source,
      jobId: asset.jobId,
      meta: asset.meta,
      job: asset.job
        ? {
            canvasProjectId: asset.job.canvasProjectId,
            input: asset.job.input,
          }
        : null,
    });
    return {
      ...asset,
      source,
      job,
    };
  }

  private toJobPreview(job: {
    id: string;
    canvasProjectId: string | null;
    canvasNodeId: string | null;
    modelName: string | null;
    channelName: string | null;
    input: Record<string, unknown> | null;
  }) {
    const input = job.input ?? {};
    const prompt =
      typeof input.prompt === "string" ? input.prompt.trim() || null : null;
    const referenceUrls = Array.isArray(input.referenceUrls)
      ? input.referenceUrls.filter(
          (u): u is string => typeof u === "string" && Boolean(u.trim()),
        )
      : [];
    const manjuProjectId =
      typeof input.manjuProjectId === "string" ? input.manjuProjectId : null;

    return {
      id: job.id,
      canvasProjectId: job.canvasProjectId,
      canvasNodeId: job.canvasNodeId,
      manjuProjectId,
      modelName: job.modelName,
      channelName: job.channelName,
      prompt,
      referenceUrls,
    };
  }

  findByIds(userId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.assets.find({
      where: { userId, id: In(ids) },
    });
  }
}

function parseFromFilter(from?: string): Date | null {
  if (!from?.trim()) return null;
  const key = from.trim().toLowerCase();
  const now = Date.now();
  if (key === "1d" || key === "today") {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (key === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (key === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  const parsed = Date.parse(from);
  if (Number.isFinite(parsed)) return new Date(parsed);
  return null;
}
