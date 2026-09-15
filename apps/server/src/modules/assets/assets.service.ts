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
