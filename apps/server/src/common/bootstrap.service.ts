import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "./prisma/prisma.service";
import { ProviderPlatform } from "@joyai/shared";

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run() {
    await this.ensureAdmin();
    await this.ensureDefaultChannel();
  }

  private async ensureAdmin() {
    const username =
      this.config.get<string>("AUTH_BOOTSTRAP_USERNAME") ?? "admin";
    const password =
      this.config.get<string>("AUTH_BOOTSTRAP_PASSWORD") ?? "admin123";

    const existing = await this.prisma.user.findUnique({ where: { username } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.create({
      data: { username, passwordHash, role: "admin" },
    });
    this.logger.log(`Bootstrap admin created: ${username}`);
  }

  private async ensureDefaultChannel() {
    const apiKey = this.config.get<string>("ARK_API_KEY");
    if (!apiKey) return;

    const count = await this.prisma.channel.count();
    if (count > 0) return;

    const baseUrl =
      this.config.get<string>("ARK_BASE_URL") ??
      "https://ark.cn-beijing.volces.com/api/v3";
    const imageModel =
      this.config.get<string>("ARK_IMAGE_MODEL") ?? "doubao-seedream-4-0-250828";
    const videoModel =
      this.config.get<string>("ARK_VIDEO_MODEL") ??
      "doubao-seedance-1-0-pro-250528";

    const channel = await this.prisma.channel.create({
      data: {
        name: "Volcengine Ark",
        platform: ProviderPlatform.VOLCENGINE,
        apiKey,
        baseUrl,
        enabled: true,
      },
    });

    await this.prisma.model.createMany({
      data: [
        {
          channelId: channel.id,
          name: "Seedream",
          kind: "image",
          remoteId: imageModel,
          enabled: true,
          isDefault: true,
        },
        {
          channelId: channel.id,
          name: "Seedance",
          kind: "video",
          remoteId: videoModel,
          enabled: true,
          isDefault: true,
        },
      ],
    });

    this.logger.log("Bootstrap volcengine channel + models from env");
  }
}
