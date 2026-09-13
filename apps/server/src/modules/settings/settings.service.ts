import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(key: string) {
    return this.prisma.appSetting.findUnique({ where: { key } });
  }

  async set(key: string, value: Prisma.InputJsonValue) {
    return this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  list() {
    return this.prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  }
}
