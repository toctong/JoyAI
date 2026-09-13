import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  findByMd5(userId: string, md5: string) {
    return this.prisma.asset.findFirst({
      where: { userId, md5: md5.trim().toLowerCase() },
      orderBy: { createdAt: "desc" },
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
    meta?: Prisma.InputJsonValue;
  }) {
    return this.prisma.asset.create({
      data: {
        ...data,
        md5: data.md5?.trim().toLowerCase(),
      },
    });
  }

  list(userId: string, take = 50) {
    return this.prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        job: {
          select: {
            id: true,
            canvasProjectId: true,
            canvasNodeId: true,
          },
        },
      },
    });
  }

  findByIds(userId: string, ids: string[]) {
    if (!ids.length) return Promise.resolve([]);
    return this.prisma.asset.findMany({
      where: { userId, id: { in: ids } },
    });
  }
}
