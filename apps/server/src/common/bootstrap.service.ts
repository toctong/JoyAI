import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import {
  CHANNEL_PRESETS,
  ProviderPlatform,
  getCatalogForPlatform,
} from "@joyai/shared";
import { User } from "../database/entities/user.entity";
import { Channel } from "../database/entities/channel.entity";
import { Model } from "../database/entities/model.entity";
import { JobKind, UserRole } from "../database/enums";

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Channel) private readonly channels: Repository<Channel>,
    @InjectRepository(Model) private readonly models: Repository<Model>,
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

    const existing = await this.users.findOne({ where: { username } });
    if (existing) return;

    const passwordHash = await bcrypt.hash(password, 10);
    await this.users.save(
      this.users.create({
        username,
        passwordHash,
        role: UserRole.admin,
      }),
    );
    this.logger.log(`Bootstrap admin created: ${username}`);
  }

  private async ensureChannelFromEnv(
    platform: (typeof ProviderPlatform)[keyof typeof ProviderPlatform],
    apiKeyEnv: string,
    baseUrlEnv: string,
  ) {
    const apiKey = this.config.get<string>(apiKeyEnv);
    if (!apiKey) return;

    const existing = await this.channels.findOne({ where: { platform } });
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

    const channel = await this.channels.save(
      this.channels.create({
        name: preset.defaultName,
        platform,
        apiKey,
        baseUrl,
        enabled: true,
        metadata: Object.keys(metadata).length ? metadata : null,
      }),
    );

    for (const item of catalog) {
      await this.models.save(
        this.models.create({
          channelId: channel.id,
          name: item.name,
          kind: item.kind as JobKind,
          remoteId: item.remoteId,
          description: item.description ?? null,
          pricing: (item.pricing as Record<string, unknown>) ?? null,
          capabilities: (item.capabilities as Record<string, unknown>) ?? null,
          enabled: true,
          isDefault: item.isDefault ?? false,
        }),
      );
    }

    this.logger.log(
      `Bootstrap ${platform} channel + ${catalog.length} catalog models from env`,
    );
  }
}
