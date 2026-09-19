import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Asset } from "../../database/entities/asset.entity";
import { StorageService } from "../storage/storage.service";
import { fetchPublicImage } from "../storage/fetch-public-image";

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
    return {
      ...asset,
      job: asset.job ? this.toJobPreview(asset.job) : null,
    };
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
    const stamp = {
      savedFromCanvas: true,
      savedAt: new Date().toISOString(),
      ...(data.meta ?? {}),
    };

    if (data.assetId?.trim()) {
      const owned = await this.assets.findOne({
        where: { id: data.assetId.trim(), userId },
      });
      if (!owned) throw new NotFoundException("素材不存在");
      const saved = await this.patchMeta(owned.id, stamp);
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
        meta: { ...stamp, sha256: put.sha256, storageKey: put.key, preview: text.slice(0, 240) },
      });
      return { ...asset, reused: false as const };
    }

    const url = data.url?.trim();
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
      throw new BadRequestException("没有可保存的媒体地址");
    }

    const existing = await this.findByUrl(userId, url);
    if (existing) {
      const saved = await this.patchMeta(existing.id, stamp);
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
          const saved = await this.patchMeta(byMd5.id, stamp);
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
          meta: { ...stamp, sha256: put.sha256, storageKey: put.key, sourceUrl: url },
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
    meta?: Record<string, unknown> | null;
  }) {
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

  list(userId: string, take = 50) {
    return this.assets
      .find({
        where: { userId },
        order: { createdAt: "DESC" },
        take,
        relations: ["job"],
      })
      .then((rows) =>
        rows.map((a) => ({
          ...a,
          job: a.job ? this.toJobPreview(a.job) : null,
        })),
      );
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

    return {
      id: job.id,
      canvasProjectId: job.canvasProjectId,
      canvasNodeId: job.canvasNodeId,
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
