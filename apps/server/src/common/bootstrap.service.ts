import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import {
  CHANNEL_PRESETS,
  ProviderPlatform,
  getCatalogForPlatform,
} from "@joyai/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma/prisma.service";

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run() {
    await this.ensureAdmin();
    await this.ensureChannelFromEnv(
      ProviderPlatform.VOLCENGINE,
      "ARK_API_KEY",
      "ARK_BASE_URL",
    );
    await this.ensureChannelFromEnv(
      ProviderPlatform.APIMART,
      "APIMART_API_KEY",
      "APIMART_BASE_URL",
    );
    await this.ensureChannelFromEnv(
      ProviderPlatform.TOAPIS,
      "TOAPIS_API_KEY",
      "TOAPIS_BASE_URL",
    );
    await this.ensureChannelFromEnv(
      ProviderPlatform.DASHSCOPE,
      "DASHSCOPE_API_KEY",
      "DASHSCOPE_BASE_URL",
    );
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

  private async ensureChannelFromEnv(
    platform: (typeof ProviderPlatform)[keyof typeof ProviderPlatform],
    apiKeyEnv: string,
    baseUrlEnv: string,
  ) {
    const apiKey = this.config.get<string>(apiKeyEnv);
    if (!apiKey) return;

    const existing = await this.prisma.channel.findFirst({
      where: { platform },
    });
    if (existing) return;

    const preset = CHANNEL_PRESETS[platform];
    const baseUrl = this.config.get<string>(baseUrlEnv) ?? preset.baseUrl;
    const metadata: Record<string, unknown> = {};
    if (preset.dashscopeApiBase) {
      metadata.dashscopeApiBase = preset.dashscopeApiBase;
    }

    // Legacy env overrides for volcengine model ids
    const catalog = getCatalogForPlatform(platform).map((m) => {
      if (platform === ProviderPlatform.VOLCENGINE && m.kind === "image") {
        const id =
          this.config.get<string>("ARK_IMAGE_MODEL") ?? m.remoteId;
        return { ...m, remoteId: id };
      }
      if (platform === ProviderPlatform.VOLCENGINE && m.kind === "video") {
        const id =
          this.config.get<string>("ARK_VIDEO_MODEL") ?? m.remoteId;
        return { ...m, remoteId: id };
      }
      return m;
    });

    const channel = await this.prisma.channel.create({
      data: {
        name: preset.defaultName,
        platform,
        apiKey,
        baseUrl,
        enabled: true,
        metadata: Object.keys(metadata).length
          ? (metadata as Prisma.InputJsonValue)
          : undefined,
      },
    });

    for (const item of catalog) {
      await this.prisma.model.create({
        data: {
          channelId: channel.id,
          name: item.name,
          kind: item.kind,
          remoteId: item.remoteId,
          description: item.description,
          pricing: item.pricing as Prisma.InputJsonValue,
          capabilities: item.capabilities as Prisma.InputJsonValue,
          enabled: true,
          isDefault: item.isDefault ?? false,
        },
      });
    }

    this.logger.log(
      `Bootstrap ${platform} channel + ${catalog.length} catalog models from env`,
    );
  }
}
