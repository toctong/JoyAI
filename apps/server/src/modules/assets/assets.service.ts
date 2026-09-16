import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Asset } from "../../database/entities/asset.entity";

@Injectable()
export class AssetsService {
  constructor(
    @InjectRepository(Asset) private readonly assets: Repository<Asset>,
  ) {}

  findByMd5(userId: string, md5: string) {
    return this.assets.findOne({
      where: { userId, md5: md5.trim().toLowerCase() },
      order: { createdAt: "DESC" },
    });
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
    return this.assets.find({
      where: { userId },
      order: { createdAt: "DESC" },
      take,
      relations: ["job"],
    }).then((rows) =>
      rows.map((a) => ({
        ...a,
        job: a.job
          ? {
              id: a.job.id,
              canvasProjectId: a.job.canvasProjectId,
              canvasNodeId: a.job.canvasNodeId,
            }
          : null,
      })),
    );
  }

  findByIds(userId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.assets.find({
      where: { userId, id: In(ids) },
    });
  }
}
