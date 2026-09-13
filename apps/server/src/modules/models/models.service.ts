import { Injectable, NotFoundException } from "@nestjs/common";
import { JobKind } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.model.findMany({
      include: { channel: { select: { id: true, name: true, platform: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  listPublic() {
    return this.prisma.model.findMany({
      where: { enabled: true, channel: { enabled: true } },
      select: {
        id: true,
        name: true,
        kind: true,
        isDefault: true,
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
    enabled?: boolean;
    isDefault?: boolean;
  }) {
    return this.prisma.model.create({ data });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      remoteId: string;
      enabled: boolean;
      isDefault: boolean;
    }>,
  ) {
    const model = await this.prisma.model.findUnique({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");
    return this.prisma.model.update({ where: { id }, data });
  }

  async remove(id: string) {
    const model = await this.prisma.model.findUnique({ where: { id } });
    if (!model) throw new NotFoundException("模型不存在");
    return this.prisma.model.delete({ where: { id } });
  }
}
